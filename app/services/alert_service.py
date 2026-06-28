from app.utils.database import get_db_connection
from app.services.coingecko_service import get_current_prices

def get_alerts(user_id):
    conn = get_db_connection()
    rows = conn.execute(
        'SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC',
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_active_alert_count(user_id):
    conn = get_db_connection()
    count = conn.execute(
        'SELECT COUNT(*) FROM alerts WHERE user_id = ? AND active = 1',
        (user_id,)
    ).fetchone()[0]
    conn.close()
    return count

def create_alert(user_id, crypto_id, crypto_name, condition, target_price):
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO alerts (user_id, crypto_id, crypto_name, condition, target_price) VALUES (?, ?, ?, ?, ?)',
        (user_id, crypto_id, crypto_name, condition, target_price)
    )
    conn.commit()
    conn.close()

def delete_alert(alert_id, user_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM alerts WHERE id = ? AND user_id = ?', (alert_id, user_id))
    conn.commit()
    conn.close()

def check_alerts(socketio_instance, app):
    with app.app_context():
        conn = get_db_connection()
        active = conn.execute('SELECT * FROM alerts WHERE active = 1').fetchall()
        if not active:
            conn.close()
            return

        crypto_ids = list({a['crypto_id'] for a in active})
        prices = get_current_prices(crypto_ids)
        triggered = []

        for alert in active:
            price = prices.get(alert['crypto_id'], {}).get('usd', 0)
            if not price:
                continue
            fired = (
                (alert['condition'] == 'above' and price >= alert['target_price']) or
                (alert['condition'] == 'below' and price <= alert['target_price'])
            )
            if fired:
                conn.execute(
                    'UPDATE alerts SET active = 0, triggered_at = CURRENT_TIMESTAMP WHERE id = ?',
                    (alert['id'],)
                )
                triggered.append({
                    'user_id': alert['user_id'],
                    'crypto_name': alert['crypto_name'],
                    'condition': alert['condition'],
                    'target_price': alert['target_price'],
                    'current_price': price,
                })

        conn.commit()
        conn.close()

        for t in triggered:
            socketio_instance.emit('alert_triggered', t)
