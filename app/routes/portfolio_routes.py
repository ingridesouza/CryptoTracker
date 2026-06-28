from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from app.services.portfolio_service import get_portfolio, add_holding, remove_holding

portfolio_bp = Blueprint('portfolio_api', __name__)

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
