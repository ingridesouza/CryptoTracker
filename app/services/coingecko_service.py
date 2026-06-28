import requests
import os
import time

BASE = 'https://api.coingecko.com/api/v3'

# ── In-memory TTL cache ──────────────────────────────────────
_cache: dict = {}

def _get(key):
    entry = _cache.get(key)
    if entry and (time.time() - entry['ts']) < entry['ttl']:
        return entry['data']
    return None

def _set(key, data, ttl):
    _cache[key] = {'data': data, 'ts': time.time(), 'ttl': ttl}

# ── Helpers ──────────────────────────────────────────────────
def _headers():
    key = os.getenv('API_COINGECKO')
    return {'x-cg-demo-api-key': key} if key else {}

# ── Public API ───────────────────────────────────────────────
def get_top_cryptos(limit=20, currency='usd'):
    cache_key = f'top_cryptos:{limit}:{currency}'
    cached = _get(cache_key)
    if cached is not None:
        return cached

    try:
        resp = requests.get(
            f'{BASE}/coins/markets',
            params={
                'vs_currency': currency,
                'order': 'market_cap_desc',
                'per_page': limit,
                'page': 1,
                'sparkline': 'true',
                'price_change_percentage': '1h,24h,7d',
            },
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        # Persist to local DB for analysis_service
        from app.utils.database import get_db_connection
        conn = get_db_connection()
        for c in data:
            conn.execute(
                'INSERT OR REPLACE INTO cryptos (id, name, price, price_change_percentage_24h, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
                (c['id'], c['name'], c.get('current_price', 0), c.get('price_change_percentage_24h', 0))
            )
        conn.commit()
        conn.close()

        _set(cache_key, data, ttl=90)
        return data
    except Exception as e:
        return {'error': str(e)}


def get_current_prices(crypto_ids):
    if not crypto_ids:
        return {}
    cache_key = 'prices:' + ','.join(sorted(crypto_ids))
    cached = _get(cache_key)
    if cached is not None:
        return cached

    try:
        resp = requests.get(
            f'{BASE}/simple/price',
            params={'ids': ','.join(crypto_ids), 'vs_currencies': 'usd,brl,eur'},
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        _set(cache_key, data, ttl=90)
        return data
    except Exception:
        return {}


def get_coin_details(crypto_id):
    cache_key = f'coin:{crypto_id}'
    cached = _get(cache_key)
    if cached is not None:
        return cached

    try:
        resp = requests.get(
            f'{BASE}/coins/{crypto_id}',
            params={
                'localization': 'false',
                'tickers': 'false',
                'market_data': 'true',
                'community_data': 'false',
                'developer_data': 'false',
            },
            headers=_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        _set(cache_key, data, ttl=120)
        return data
    except Exception as e:
        return {'error': str(e)}


def search_coins(query):
    """Busca por nome ou símbolo — retorna lista de candidatos."""
    q = query.strip().lower()
    cache_key = f'search:{q}'
    cached = _get(cache_key)
    if cached is not None:
        return cached

    try:
        resp = requests.get(
            f'{BASE}/search',
            params={'query': q},
            headers=_headers(),
            timeout=8,
        )
        resp.raise_for_status()
        coins = resp.json().get('coins', [])
        results = [
            {
                'id':     c['id'],
                'name':   c['name'],
                'symbol': c['symbol'].upper(),
                'thumb':  c.get('thumb', ''),
                'rank':   c.get('market_cap_rank'),
            }
            for c in coins[:12]
        ]
        _set(cache_key, results, ttl=120)
        return results
    except Exception as e:
        return []


def get_converter_rate(from_id, to_currency, amount=1.0):
    cache_key = f'rate:{from_id}:{to_currency}'
    cached = _get(cache_key)
    rate = None
    if cached is not None:
        rate = cached
    else:
        try:
            resp = requests.get(
                f'{BASE}/simple/price',
                params={'ids': from_id, 'vs_currencies': to_currency},
                headers=_headers(),
                timeout=10,
            )
            resp.raise_for_status()
            rate = resp.json().get(from_id, {}).get(to_currency, 0)
            _set(cache_key, rate, ttl=90)
        except Exception as e:
            return {'error': str(e), 'rate': 0, 'result': 0}

    return {'rate': rate, 'result': rate * amount}
