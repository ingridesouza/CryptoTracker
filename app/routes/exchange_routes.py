from flask import Blueprint, request, jsonify, Response
from flask_login import login_required, current_user
from app.services.exchange_service import (
    get_exchange_keys, add_exchange_key, delete_exchange_key,
    sync_exchange, test_connection, import_csv,
)

exchange_bp = Blueprint('exchange', __name__)


@exchange_bp.route('/api/exchanges', methods=['GET'])
@login_required
def list_keys():
    keys, total_imported = get_exchange_keys(current_user.id)
    return jsonify({'keys': keys, 'total_imported': total_imported})


@exchange_bp.route('/api/exchanges', methods=['POST'])
@login_required
def add_key():
    data = request.get_json()
    if not data or not data.get('exchange') or not data.get('api_key'):
        return jsonify({'ok': False, 'error': 'Campos obrigatórios: exchange, api_key'}), 400
    add_exchange_key(
        current_user.id,
        data['exchange'],
        data['api_key'],
        data.get('api_secret', ''),
        data.get('label', ''),
    )
    return jsonify({'ok': True})


@exchange_bp.route('/api/exchanges/<int:key_id>', methods=['DELETE'])
@login_required
def del_key(key_id):
    delete_exchange_key(key_id, current_user.id)
    return jsonify({'ok': True})


@exchange_bp.route('/api/exchanges/<int:key_id>/test', methods=['POST'])
@login_required
def test_key(key_id):
    try:
        test_connection(key_id, current_user.id)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400


@exchange_bp.route('/api/exchanges/<int:key_id>/sync', methods=['POST'])
@login_required
def sync_key(key_id):
    try:
        n = sync_exchange(key_id, current_user.id)
        return jsonify({'ok': True, 'imported': n})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400


@exchange_bp.route('/api/exchanges/import-csv', methods=['POST'])
@login_required
def import_csv_route():
    if 'file' not in request.files:
        return jsonify({'ok': False, 'error': 'Nenhum arquivo enviado'}), 400
    f = request.files['file']
    if not f.filename.lower().endswith('.csv'):
        return jsonify({'ok': False, 'error': 'Somente arquivos .csv são aceitos'}), 400
    imported, errors = import_csv(current_user.id, f.read(), f.filename)
    return jsonify({'ok': True, 'imported': imported, 'errors': errors})


@exchange_bp.route('/api/exchanges/template-csv')
@login_required
def template_csv():
    rows = [
        'date,type,coin_id,coin_name,coin_symbol,quantity,price_brl,notes',
        '2024-01-15,buy,bitcoin,Bitcoin,BTC,0.10000000,298500.00,',
        '2024-02-20,sell,ethereum,Ethereum,ETH,1.50000000,18750.00,',
        '2024-03-10,buy,solana,Solana,SOL,5.00000000,890.00,',
    ]
    content = '﻿' + '\n'.join(rows) + '\n'
    return Response(
        content,
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment;filename=cryptotracker_template.csv'},
    )
