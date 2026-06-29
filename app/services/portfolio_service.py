from app.utils.database import get_db_connection
from app.services.coingecko_service import get_current_prices

# ── Transaction-based portfolio (Fase 1) ─────────────────────

def get_transactions(user_id):
    conn = get_db_connection()
    rows = conn.execute(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, created_at DESC',
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_transaction(user_id, crypto_id, crypto_name, crypto_symbol,
                    tx_type, quantity, price_brl, price_usd, usd_brl_rate, date, notes=''):
    conn = get_db_connection()
    conn.execute(
        '''INSERT INTO transactions
           (user_id, crypto_id, crypto_name, crypto_symbol, type,
            quantity, price_brl, price_usd, usd_brl_rate, date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (user_id, crypto_id, crypto_name, crypto_symbol, tx_type,
         quantity, price_brl, price_usd, usd_brl_rate, date, notes)
    )
    conn.commit()
    conn.close()

def delete_transaction(tx_id, user_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM transactions WHERE id = ? AND user_id = ?', (tx_id, user_id))
    conn.commit()
    conn.close()

def get_holdings_summary(user_id):
    """Custo médio ponderado por moeda, derivado das transações."""
    txs = get_transactions(user_id)
    coins = {}
    for tx in txs:
        cid = tx['crypto_id']
        if cid not in coins:
            coins[cid] = {
                'crypto_id': cid,
                'crypto_name': tx['crypto_name'],
                'crypto_symbol': tx['crypto_symbol'],
                'buy_qty': 0.0,
                'buy_cost_brl': 0.0,
                'sell_qty': 0.0,
            }
        if tx['type'] == 'buy':
            coins[cid]['buy_qty'] += tx['quantity']
            coins[cid]['buy_cost_brl'] += tx['quantity'] * tx['price_brl']
        else:
            coins[cid]['sell_qty'] += tx['quantity']

    result = []
    for h in coins.values():
        net_qty = round(h['buy_qty'] - h['sell_qty'], 10)
        if net_qty < 1e-8:
            continue
        avg_cost = h['buy_cost_brl'] / h['buy_qty'] if h['buy_qty'] > 0 else 0
        result.append({
            'crypto_id': h['crypto_id'],
            'crypto_name': h['crypto_name'],
            'crypto_symbol': h['crypto_symbol'],
            'quantity': net_qty,
            'avg_cost_brl': round(avg_cost, 2),
            'total_invested_brl': round(net_qty * avg_cost, 2),
        })
    return result

def get_portfolio(user_id):
    conn = get_db_connection()
    holdings = conn.execute(
        'SELECT * FROM portfolio WHERE user_id = ? ORDER BY created_at DESC',
        (user_id,)
    ).fetchall()
    conn.close()

    if not holdings:
        return {'holdings': [], 'total_value': 0, 'total_cost': 0, 'total_pnl': 0, 'total_pnl_pct': 0}

    crypto_ids = list({h['crypto_id'] for h in holdings})
    prices = get_current_prices(crypto_ids)

    result = []
    total_value = 0
    total_cost = 0

    for h in holdings:
        current_price = prices.get(h['crypto_id'], {}).get('usd', 0)
        cost = h['amount'] * h['purchase_price']
        value = h['amount'] * current_price
        pnl = value - cost
        pnl_pct = (pnl / cost * 100) if cost > 0 else 0
        total_value += value
        total_cost += cost
        result.append({
            'id': h['id'],
            'crypto_id': h['crypto_id'],
            'crypto_name': h['crypto_name'],
            'amount': h['amount'],
            'purchase_price': h['purchase_price'],
            'current_price': current_price,
            'cost': round(cost, 2),
            'value': round(value, 2),
            'pnl': round(pnl, 2),
            'pnl_pct': round(pnl_pct, 2),
            'purchase_date': h['purchase_date'],
        })

    total_pnl = total_value - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0

    return {
        'holdings': result,
        'total_value': round(total_value, 2),
        'total_cost': round(total_cost, 2),
        'total_pnl': round(total_pnl, 2),
        'total_pnl_pct': round(total_pnl_pct, 2),
    }

def add_holding(user_id, crypto_id, crypto_name, amount, purchase_price, purchase_date=None):
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO portfolio (user_id, crypto_id, crypto_name, amount, purchase_price, purchase_date) VALUES (?, ?, ?, ?, ?, ?)',
        (user_id, crypto_id, crypto_name, amount, purchase_price, purchase_date)
    )
    conn.commit()
    conn.close()

def remove_holding(holding_id, user_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM portfolio WHERE id = ? AND user_id = ?', (holding_id, user_id))
    conn.commit()
    conn.close()
