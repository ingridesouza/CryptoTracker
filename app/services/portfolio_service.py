from app.utils.database import get_db_connection
from app.services.coingecko_service import get_current_prices

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
