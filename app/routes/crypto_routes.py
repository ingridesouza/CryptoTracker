from flask import Blueprint, jsonify, request
from flask_login import login_required
from app.services.coingecko_service import get_top_cryptos, get_coin_details, get_converter_rate
from app.services.history_service import get_price_history
from app.services.global_service import get_global_stats, get_fear_greed, get_trending

crypto_bp = Blueprint('crypto', __name__)

@crypto_bp.route('/get-top-cryptos')
@login_required
def top_cryptos():
    limit = request.args.get('limit', 20, type=int)
    currency = request.args.get('currency', 'usd')
    data = get_top_cryptos(limit=limit, currency=currency)
    if isinstance(data, dict) and 'error' in data:
        return jsonify(data), 500
    return jsonify(data)

@crypto_bp.route('/api/coin/<crypto_id>')
@login_required
def coin_detail(crypto_id):
    data = get_coin_details(crypto_id)
    if 'error' in data:
        return jsonify(data), 500
    return jsonify(data)

@crypto_bp.route('/api/history/<crypto_id>')
@login_required
def price_history(crypto_id):
    days = request.args.get('days', 30, type=int)
    currency = request.args.get('currency', 'usd')
    return jsonify(get_price_history(crypto_id, days=days, currency=currency))

@crypto_bp.route('/api/global')
@login_required
def global_data():
    return jsonify({
        'stats': get_global_stats(),
        'fear_greed': get_fear_greed(),
        'trending': get_trending(),
    })

@crypto_bp.route('/api/convert')
@login_required
def convert():
    from_id = request.args.get('from_id', '')
    to_currency = request.args.get('to', 'usd')
    amount = request.args.get('amount', 1.0, type=float)
    if not from_id:
        return jsonify({'error': 'from_id obrigatório'}), 400
    return jsonify(get_converter_rate(from_id, to_currency, amount))

@crypto_bp.route('/crypto/<crypto_id>')
@login_required
def search_crypto(crypto_id):
    data = get_coin_details(crypto_id)
    if 'error' in data:
        return jsonify(data), 404
    return jsonify(data)
