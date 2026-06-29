"""
exchange_service.py — Integração com Binance e Mercado Bitcoin + importação CSV.

Segurança: chaves de API são criptografadas com Fernet antes de salvar no banco.
A chave Fernet é lida de FERNET_KEY (env) ou gerada automaticamente em .fernet_key.
"""

import os
import hmac
import hashlib
import time
import csv
import io
import requests
from urllib.parse import urlencode
from datetime import datetime, timezone
from cryptography.fernet import Fernet

from app.utils.database import get_db_connection
from app.services.exchange_rate_service import get_usd_brl

# ── Criptografia ──────────────────────────────────────────────────────────────

_fernet_instance = None


def _get_fernet():
    global _fernet_instance
    if _fernet_instance:
        return _fernet_instance
    key = os.getenv('FERNET_KEY', '').encode()
    if not key:
        key_file = os.path.join(os.path.dirname(__file__), '../../.fernet_key')
        if os.path.exists(key_file):
            with open(key_file, 'rb') as f:
                key = f.read().strip()
        else:
            key = Fernet.generate_key()
            with open(key_file, 'wb') as f:
                f.write(key)
    _fernet_instance = Fernet(key)
    return _fernet_instance


def _encrypt(text):
    return _get_fernet().encrypt(text.encode()).decode()


def _decrypt(token):
    if not token:
        return ''
    return _get_fernet().decrypt(token.encode()).decode()


# ── CRUD de chaves ────────────────────────────────────────────────────────────

def get_exchange_keys(user_id):
    conn = get_db_connection()
    rows = conn.execute(
        'SELECT * FROM exchange_keys WHERE user_id = ? ORDER BY created_at DESC',
        (user_id,)
    ).fetchall()
    total_imported = conn.execute(
        "SELECT COUNT(*) as cnt FROM transactions WHERE user_id=? AND exchange IS NOT NULL",
        (user_id,)
    ).fetchone()['cnt']
    conn.close()
    keys = []
    for r in rows:
        raw_key = _decrypt(r['api_key_enc'])
        keys.append({
            'id':             r['id'],
            'exchange':       r['exchange'],
            'label':          r['label'],
            'api_key_masked': raw_key[:6] + '…' + raw_key[-4:] if len(raw_key) > 10 else raw_key[:4] + '…',
            'last_sync_at':   r['last_sync_at'],
            'created_at':     r['created_at'],
        })
    return keys, total_imported


def add_exchange_key(user_id, exchange, api_key, api_secret, label):
    conn = get_db_connection()
    conn.execute(
        '''INSERT INTO exchange_keys (user_id, exchange, label, api_key_enc, api_secret_enc)
           VALUES (?, ?, ?, ?, ?)''',
        (user_id, exchange,
         label or {'binance': 'Binance', 'mercado_bitcoin': 'Mercado Bitcoin'}.get(exchange, exchange.title()),
         _encrypt(api_key), _encrypt(api_secret) if api_secret else '')
    )
    conn.commit()
    conn.close()


def delete_exchange_key(key_id, user_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM exchange_keys WHERE id = ? AND user_id = ?', (key_id, user_id))
    conn.commit()
    conn.close()


def _get_key_raw(key_id, user_id):
    conn = get_db_connection()
    r = conn.execute(
        'SELECT * FROM exchange_keys WHERE id = ? AND user_id = ?', (key_id, user_id)
    ).fetchone()
    conn.close()
    if not r:
        return None
    return {
        'id':         r['id'],
        'exchange':   r['exchange'],
        'api_key':    _decrypt(r['api_key_enc']),
        'api_secret': _decrypt(r['api_secret_enc']),
    }


def _update_sync_time(key_id):
    conn = get_db_connection()
    conn.execute(
        'UPDATE exchange_keys SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?', (key_id,)
    )
    conn.commit()
    conn.close()


# ── Inserção com deduplicação ─────────────────────────────────────────────────

def _insert_if_new(user_id, exchange, ext_id, crypto_id, crypto_name,
                   crypto_symbol, tx_type, quantity, price_brl,
                   price_usd, usd_brl_rate, date_str, notes=''):
    conn = get_db_connection()
    exists = conn.execute(
        'SELECT id FROM transactions WHERE user_id=? AND exchange=? AND exchange_tx_id=?',
        (user_id, exchange, ext_id)
    ).fetchone()
    if exists:
        conn.close()
        return False
    conn.execute(
        '''INSERT INTO transactions
           (user_id, crypto_id, crypto_name, crypto_symbol, type,
            quantity, price_brl, price_usd, usd_brl_rate, date, notes, exchange, exchange_tx_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)''',
        (user_id, crypto_id, crypto_name, crypto_symbol, tx_type,
         quantity, round(price_brl, 2), round(price_usd or 0, 8),
         round(usd_brl_rate, 4), date_str, notes, exchange, ext_id)
    )
    conn.commit()
    conn.close()
    return True


# ── Binance ───────────────────────────────────────────────────────────────────

BINANCE_BASE = 'https://api.binance.com'

# Pares suportados: símbolo → (coin_id, coin_name, symbol, is_brl_pair)
BINANCE_TARGETS = {
    'BTCBRL':    ('bitcoin',       'Bitcoin',        'BTC',  True),
    'ETHBRL':    ('ethereum',      'Ethereum',       'ETH',  True),
    'BNBBRL':    ('binancecoin',   'BNB',            'BNB',  True),
    'XRPBRL':    ('ripple',        'XRP',            'XRP',  True),
    'ADABRL':    ('cardano',       'Cardano',        'ADA',  True),
    'DOGEBRL':   ('dogecoin',      'Dogecoin',       'DOGE', True),
    'SOLBRL':    ('solana',        'Solana',         'SOL',  True),
    'LTCBRL':    ('litecoin',      'Litecoin',       'LTC',  True),
    'BTCUSDT':   ('bitcoin',       'Bitcoin',        'BTC',  False),
    'ETHUSDT':   ('ethereum',      'Ethereum',       'ETH',  False),
    'BNBUSDT':   ('binancecoin',   'BNB',            'BNB',  False),
    'SOLUSDT':   ('solana',        'Solana',         'SOL',  False),
    'XRPUSDT':   ('ripple',        'XRP',            'XRP',  False),
    'ADAUSDT':   ('cardano',       'Cardano',        'ADA',  False),
    'DOGEUSDT':  ('dogecoin',      'Dogecoin',       'DOGE', False),
    'LTCUSDT':   ('litecoin',      'Litecoin',       'LTC',  False),
    'LINKUSDT':  ('chainlink',     'Chainlink',      'LINK', False),
    'DOTUSDT':   ('polkadot',      'Polkadot',       'DOT',  False),
    'MATICUSDT': ('matic-network', 'Polygon',        'MATIC',False),
    'AVAXUSDT':  ('avalanche-2',   'Avalanche',      'AVAX', False),
    'SHIBUSDT':  ('shiba-inu',     'Shiba Inu',      'SHIB', False),
    'UNIUSDT':   ('uniswap',       'Uniswap',        'UNI',  False),
    'ATOMUSDT':  ('cosmos',        'Cosmos',         'ATOM', False),
    'TRXUSDT':   ('tron',          'TRON',           'TRX',  False),
}


def _binance_signed_get(api_key, api_secret, path, params=None):
    params = params or {}
    params['timestamp'] = int(time.time() * 1000)
    query = urlencode(params)
    sig = hmac.new(api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
    url = f'{BINANCE_BASE}{path}?{query}&signature={sig}'
    r = requests.get(url, headers={'X-MBX-APIKEY': api_key}, timeout=15)
    return r.json()


def test_binance(api_key, api_secret):
    data = _binance_signed_get(api_key, api_secret, '/api/v3/account')
    if isinstance(data, dict) and data.get('code', 0) < 0:
        raise ValueError(data.get('msg', 'Erro na API Binance'))
    return True


def _sync_binance(user_id, api_key, api_secret):
    usd_brl = get_usd_brl()
    imported = 0
    for symbol, (cid, cname, csym, is_brl) in BINANCE_TARGETS.items():
        try:
            trades = _binance_signed_get(
                api_key, api_secret, '/api/v3/myTrades', {'symbol': symbol, 'limit': 1000}
            )
            # -1121 = símbolo inválido na região do usuário → pular silenciosamente
            if isinstance(trades, dict):
                continue
            for t in trades:
                price_raw = float(t['price'])
                qty       = float(t['qty'])
                tx_type   = 'buy' if t['isBuyer'] else 'sell'
                ts        = datetime.fromtimestamp(t['time'] / 1000, tz=timezone.utc)
                date_str  = ts.strftime('%Y-%m-%d')
                ext_id    = f'{symbol}_{t["id"]}'

                if is_brl:
                    price_brl = price_raw
                    price_usd = price_raw / usd_brl
                else:
                    price_usd = price_raw
                    price_brl = price_raw * usd_brl

                ok = _insert_if_new(
                    user_id, 'binance', ext_id,
                    cid, cname, csym, tx_type,
                    qty, price_brl, price_usd, usd_brl,
                    date_str, f'Binance {symbol}'
                )
                if ok:
                    imported += 1
        except Exception:
            continue
    return imported


# ── Mercado Bitcoin (TAPI v3) ─────────────────────────────────────────────────

MB_TAPI_URL  = 'https://www.mercadobitcoin.net/tapi/v3/'
MB_TAPI_PATH = '/tapi/v3/'

MB_COINS = {
    'BRLBTC':  ('bitcoin',       'Bitcoin',     'BTC'),
    'BRLETH':  ('ethereum',      'Ethereum',    'ETH'),
    'BRLLTC':  ('litecoin',      'Litecoin',    'LTC'),
    'BRLXRP':  ('ripple',        'XRP',         'XRP'),
    'BRLBCH':  ('bitcoin-cash',  'Bitcoin Cash','BCH'),
    'BRLADA':  ('cardano',       'Cardano',     'ADA'),
    'BRLLINK': ('chainlink',     'Chainlink',   'LINK'),
    'BRLSOL':  ('solana',        'Solana',      'SOL'),
    'BRLDOGE': ('dogecoin',      'Dogecoin',    'DOGE'),
    'BRLUNI':  ('uniswap',       'Uniswap',     'UNI'),
    'BRLMATIC':('matic-network', 'Polygon',     'MATIC'),
}


def _mb_request(tapi_id, tapi_secret, method, params=None):
    nonce = str(int(time.time() * 1000))
    data  = {'tapi_method': method, 'tapi_nonce': nonce}
    if params:
        data.update(params)
    body = urlencode(data)
    msg  = MB_TAPI_PATH + '?' + body
    mac  = hmac.new(tapi_secret.encode(), msg.encode(), hashlib.sha512).hexdigest()
    headers = {
        'TAPI-ID':     tapi_id,
        'TAPI-MAC':    mac,
        'Content-Type':'application/x-www-form-urlencoded',
    }
    r = requests.post(MB_TAPI_URL, data=body, headers=headers, timeout=15)
    return r.json()


def test_mercado_bitcoin(tapi_id, tapi_secret):
    data = _mb_request(tapi_id, tapi_secret, 'get_account_info')
    if data.get('status_code') != 100:
        raise ValueError(data.get('error_message', 'Erro na API Mercado Bitcoin'))
    return True


def _sync_mercado_bitcoin(user_id, tapi_id, tapi_secret):
    usd_brl  = get_usd_brl()
    imported = 0
    for pair, (cid, cname, csym) in MB_COINS.items():
        try:
            resp = _mb_request(tapi_id, tapi_secret, 'list_user_trades',
                               {'coin_pair': pair})
            if resp.get('status_code') != 100:
                continue
            trades = resp.get('response_data', {}).get('trades', [])
            for t in trades:
                qty       = float(t.get('amount', 0))
                price_brl = float(t.get('price', 0))
                price_usd = price_brl / usd_brl
                tx_type   = 'buy' if t.get('type') == 'buy' else 'sell'
                ts        = datetime.fromtimestamp(int(t['date']), tz=timezone.utc)
                date_str  = ts.strftime('%Y-%m-%d')
                ext_id    = str(t['tid'])
                ok = _insert_if_new(
                    user_id, 'mercado_bitcoin', ext_id,
                    cid, cname, csym, tx_type,
                    qty, price_brl, price_usd, usd_brl,
                    date_str, f'Mercado Bitcoin {csym}'
                )
                if ok:
                    imported += 1
        except Exception:
            continue
    return imported


# ── Orquestração de sync ──────────────────────────────────────────────────────

def sync_exchange(key_id, user_id):
    raw = _get_key_raw(key_id, user_id)
    if not raw:
        raise ValueError('Chave não encontrada')
    ex = raw['exchange']
    if ex == 'binance':
        n = _sync_binance(user_id, raw['api_key'], raw['api_secret'])
    elif ex == 'mercado_bitcoin':
        n = _sync_mercado_bitcoin(user_id, raw['api_key'], raw['api_secret'])
    else:
        raise ValueError(f'Exchange não suportada: {ex}')
    _update_sync_time(key_id)
    return n


def test_connection(key_id, user_id):
    raw = _get_key_raw(key_id, user_id)
    if not raw:
        raise ValueError('Chave não encontrada')
    if raw['exchange'] == 'binance':
        return test_binance(raw['api_key'], raw['api_secret'])
    if raw['exchange'] == 'mercado_bitcoin':
        return test_mercado_bitcoin(raw['api_key'], raw['api_secret'])
    return True


# ── Importação CSV ────────────────────────────────────────────────────────────

COIN_NAME_MAP = {
    'BTC':  ('bitcoin',       'Bitcoin'),
    'ETH':  ('ethereum',      'Ethereum'),
    'BNB':  ('binancecoin',   'BNB'),
    'SOL':  ('solana',        'Solana'),
    'XRP':  ('ripple',        'XRP'),
    'ADA':  ('cardano',       'Cardano'),
    'DOGE': ('dogecoin',      'Dogecoin'),
    'LTC':  ('litecoin',      'Litecoin'),
    'LINK': ('chainlink',     'Chainlink'),
    'DOT':  ('polkadot',      'Polkadot'),
    'MATIC':('matic-network', 'Polygon'),
    'AVAX': ('avalanche-2',   'Avalanche'),
    'SHIB': ('shiba-inu',     'Shiba Inu'),
    'UNI':  ('uniswap',       'Uniswap'),
    'ATOM': ('cosmos',        'Cosmos'),
    'TRX':  ('tron',          'TRON'),
    'BCH':  ('bitcoin-cash',  'Bitcoin Cash'),
}


def _detect_format(headers):
    h = {x.strip().lower() for x in headers}
    if 'date(utc)' in h or ('pair' in h and 'side' in h):
        return 'binance'
    if 'coin_id' in h or 'coin_symbol' in h:
        return 'template'
    return 'generic'


def _num(s):
    return float(str(s).replace(',', '').strip() or 0)


def _parse_row(row, fmt, usd_brl):
    if fmt == 'template':
        date_  = row.get('date', '').strip()
        type_  = row.get('type', '').strip().lower()
        cid    = row.get('coin_id', '').strip()
        cname  = row.get('coin_name', '').strip()
        csym   = row.get('coin_symbol', '').strip().upper()
        qty    = _num(row.get('quantity', 0))
        pbrl   = _num(row.get('price_brl', 0))
        notes  = row.get('notes', '')
        if not date_ or type_ not in ('buy', 'sell') or qty <= 0 or pbrl <= 0:
            return None
        return {'date': date_, 'type': type_, 'coin_id': cid, 'coin_name': cname,
                'coin_symbol': csym, 'quantity': qty, 'price_brl': pbrl,
                'price_usd': pbrl / usd_brl, 'notes': notes}

    if fmt == 'binance':
        date_raw = row.get('Date(UTC)', '').strip()
        try:
            date_ = datetime.strptime(date_raw, '%Y-%m-%d %H:%M:%S').strftime('%Y-%m-%d')
        except Exception:
            date_ = date_raw[:10]

        pair   = row.get('Pair', '').strip().upper()
        side   = row.get('Side', '').strip().upper()
        price  = _num(row.get('Price', 0))
        exec_  = row.get('Executed', '').strip()  # "0.1 BTC"

        is_brl = pair.endswith('BRL')
        is_usdt = pair.endswith('USDT')
        if is_brl:
            csym = pair[:-3]
        elif is_usdt:
            csym = pair[:-4]
        else:
            return None

        parts = exec_.split()
        qty   = _num(parts[0]) if parts else 0
        if qty <= 0 or price <= 0:
            return None

        if is_brl:
            price_brl = price
            price_usd = price / usd_brl
        else:
            price_usd = price
            price_brl = price * usd_brl

        cid, cname = COIN_NAME_MAP.get(csym, (csym.lower(), csym))
        return {'date': date_, 'type': 'buy' if side == 'BUY' else 'sell',
                'coin_id': cid, 'coin_name': cname, 'coin_symbol': csym,
                'quantity': qty, 'price_brl': price_brl, 'price_usd': price_usd}

    # Generic: fuzzy column mapping
    date_  = (row.get('date') or row.get('Date') or row.get('data') or '').strip()[:10]
    raw_t  = (row.get('type') or row.get('Type') or row.get('side') or row.get('Side') or '').strip().lower()
    if raw_t in ('buy', 'compra', 'b'):
        type_ = 'buy'
    elif raw_t in ('sell', 'venda', 's'):
        type_ = 'sell'
    else:
        return None

    csym   = (row.get('coin_symbol') or row.get('symbol') or row.get('Symbol') or row.get('coin') or '').strip().upper()
    qty    = _num(row.get('quantity') or row.get('amount') or row.get('Amount') or 0)
    price  = _num(row.get('price_brl') or row.get('price') or row.get('Price') or 0)
    cur    = (row.get('currency') or row.get('Currency') or 'BRL').strip().upper()

    if not date_ or not csym or qty <= 0 or price <= 0:
        return None

    if cur in ('USD', 'USDT'):
        price_brl = price * usd_brl
        price_usd = price
    else:
        price_brl = price
        price_usd = price / usd_brl

    cid, cname = COIN_NAME_MAP.get(csym, (csym.lower(), csym))
    return {'date': date_, 'type': type_, 'coin_id': cid, 'coin_name': cname,
            'coin_symbol': csym, 'quantity': qty,
            'price_brl': price_brl, 'price_usd': price_usd}


def import_csv(user_id, file_bytes, filename=''):
    """
    Aceita 3 formatos:
    1. Template próprio: date, type, coin_id, coin_name, coin_symbol, quantity, price_brl [, notes]
    2. Export Binance: Date(UTC), Pair, Side, Price, Executed, ...
    3. Genérico: mapeamento por nome de coluna (fuzzy)
    """
    content = file_bytes.decode('utf-8-sig')
    reader  = csv.DictReader(io.StringIO(content))
    headers = reader.fieldnames or []
    usd_brl = get_usd_brl()
    fmt     = _detect_format(headers)

    imported = 0
    errors   = []

    for i, row in enumerate(reader, start=2):
        try:
            tx = _parse_row(row, fmt, usd_brl)
            if tx is None:
                continue
            ext_id = f'csv_{filename}_{i}'
            ok = _insert_if_new(
                user_id, 'csv', ext_id,
                tx['coin_id'], tx['coin_name'], tx['coin_symbol'],
                tx['type'], tx['quantity'],
                tx['price_brl'], tx.get('price_usd'), usd_brl,
                tx['date'], tx.get('notes', f'CSV {filename} linha {i}')
            )
            if ok:
                imported += 1
        except Exception as e:
            errors.append(f'Linha {i}: {e}')

    return imported, errors
