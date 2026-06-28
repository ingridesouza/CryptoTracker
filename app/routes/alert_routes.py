from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from app.services.alert_service import get_alerts, create_alert, delete_alert

alert_bp = Blueprint('alerts_api', __name__)

@alert_bp.route('/api/alerts')
@login_required
def list_alerts():
    return jsonify(get_alerts(current_user.id))

@alert_bp.route('/api/alerts', methods=['POST'])
@login_required
def new_alert():
    body = request.get_json() or {}
    required = ['crypto_id', 'crypto_name', 'condition', 'target_price']
    if not all(body.get(k) is not None for k in required):
        return jsonify({'error': 'Campos obrigatórios faltando'}), 400
    if body['condition'] not in ('above', 'below'):
        return jsonify({'error': 'condition deve ser above ou below'}), 400
    create_alert(
        user_id=current_user.id,
        crypto_id=body['crypto_id'],
        crypto_name=body['crypto_name'],
        condition=body['condition'],
        target_price=float(body['target_price']),
    )
    return jsonify({'success': True})

@alert_bp.route('/api/alerts/<int:alert_id>', methods=['DELETE'])
@login_required
def remove_alert(alert_id):
    delete_alert(alert_id, current_user.id)
    return jsonify({'success': True})
