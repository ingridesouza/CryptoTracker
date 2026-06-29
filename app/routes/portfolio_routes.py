from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from app.services.portfolio_service import (
    get_portfolio, add_holding, remove_holding,
    get_transactions, add_transaction, delete_transaction, get_holdings_summary,
)
from app.services.coingecko_service import get_current_prices
from app.services.exchange_rate_service import get_usd_brl

portfolio_bp = Blueprint('portfolio_api', __name__)

# ── Legacy holdings (mantidos para compatibilidade) ───────────

@portfolio_bp.route('/api/portfolio')
@login_required
def user_portfolio():
    return jsonify(get_portfolio(current_user.id))

@portfolio_bp.route('/api/portfolio', methods=['POST'])
@login_required
def add_to_portfolio():
    body = request.get_json() or {}
    required = ['crypto_id', 'crypto_name', 'amount', 'purchase_price']
    if not all(body.get(k) for k in required):
        return jsonify({'error': 'Campos obrigatórios faltando'}), 400
    try:
        add_holding(
            user_id=current_user.id,
            crypto_id=body['crypto_id'],
            crypto_name=body['crypto_name'],
            amount=float(body['amount']),
            purchase_price=float(body['purchase_price']),
            purchase_date=body.get('purchase_date'),
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@portfolio_bp.route('/api/portfolio/<int:holding_id>', methods=['DELETE'])
@login_required
def remove_from_portfolio(holding_id):
    remove_holding(holding_id, current_user.id)
    return jsonify({'success': True})

# ── Transações ────────────────────────────────────────────────

@portfolio_bp.route('/api/transactions')
@login_required
def list_transactions():
    return jsonify(get_transactions(current_user.id))

@portfolio_bp.route('/api/transactions', methods=['POST'])
@login_required
def create_transaction():
    body = request.get_json() or {}
    required = ['crypto_id', 'crypto_name', 'crypto_symbol', 'type', 'quantity', 'price_brl', 'date']
    missing = [k for k in required if not body.get(k)]
    if missing:
        return jsonify({'error': f'Campos obrigatórios: {", ".join(missing)}'}), 400
    if body['type'] not in ('buy', 'sell'):
        return jsonify({'error': 'type deve ser buy ou sell'}), 400
    try:
        usd_brl = get_usd_brl()
        price_brl = float(body['price_brl'])
        add_transaction(
            user_id=current_user.id,
            crypto_id=body['crypto_id'],
            crypto_name=body['crypto_name'],
            crypto_symbol=body['crypto_symbol'].upper(),
            tx_type=body['type'],
            quantity=float(body['quantity']),
            price_brl=price_brl,
            price_usd=round(price_brl / usd_brl, 8),
            usd_brl_rate=usd_brl,
            date=body['date'],
            notes=body.get('notes', ''),
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@portfolio_bp.route('/api/transactions/<int:tx_id>', methods=['DELETE'])
@login_required
def remove_transaction(tx_id):
    delete_transaction(tx_id, current_user.id)
    return jsonify({'success': True})

# ── Resumo do portfolio (com preços atuais) ───────────────────

@portfolio_bp.route('/api/portfolio/summary')
@login_required
def portfolio_summary_api():
    holdings = get_holdings_summary(current_user.id)
    usd_brl = get_usd_brl()

    if not holdings:
        return jsonify({
            'holdings': [],
            'totals': {'value_brl': 0, 'value_usd': 0, 'invested_brl': 0, 'pnl_brl': 0, 'pnl_pct': 0},
            'usd_brl': usd_brl,
        })

    coin_ids = [h['crypto_id'] for h in holdings]
    prices = get_current_prices(coin_ids)

    enriched = []
    total_value_brl = 0
    total_invested_brl = 0

    for h in holdings:
        p = prices.get(h['crypto_id'], {})
        price_usd = p.get('usd', 0)
        price_brl = p.get('brl', round(price_usd * usd_brl, 2))

        current_value_brl = h['quantity'] * price_brl
        current_value_usd = h['quantity'] * price_usd
        pnl_brl = current_value_brl - h['total_invested_brl']
        pnl_pct = (pnl_brl / h['total_invested_brl'] * 100) if h['total_invested_brl'] > 0 else 0

        enriched.append({
            **h,
            'price_usd': round(price_usd, 8),
            'price_brl': round(price_brl, 2),
            'current_value_brl': round(current_value_brl, 2),
            'current_value_usd': round(current_value_usd, 2),
            'pnl_brl': round(pnl_brl, 2),
            'pnl_pct': round(pnl_pct, 2),
        })
        total_value_brl += current_value_brl
        total_invested_brl += h['total_invested_brl']

    total_pnl_brl = total_value_brl - total_invested_brl
    total_pnl_pct = (total_pnl_brl / total_invested_brl * 100) if total_invested_brl > 0 else 0

    return jsonify({
        'holdings': enriched,
        'totals': {
            'value_brl': round(total_value_brl, 2),
            'value_usd': round(total_value_brl / usd_brl, 2),
            'invested_brl': round(total_invested_brl, 2),
            'pnl_brl': round(total_pnl_brl, 2),
            'pnl_pct': round(total_pnl_pct, 2),
        },
        'usd_brl': usd_brl,
    })
