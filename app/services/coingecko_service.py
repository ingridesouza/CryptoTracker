import requests
from flask import jsonify  # Adicione esta linha para importar jsonify
from app.utils.database import get_db_connection
from flask import current_app

def get_top_cryptos():
    try:
        # Permite personalizar quantidade e moeda via query params
        from flask import request
        per_page = request.args.get('limit', 20)
        vs_currency = request.args.get('currency', 'usd')

        api_key = current_app.config.get('COINGECKO_API_KEY')
        headers = {"x-cg-demo-api-key": api_key} if api_key else {}

        response = requests.get(
            f"{current_app.config['COINGECKO_API_URL']}/coins/markets",
            params={
                'vs_currency': vs_currency,
                'order': 'market_cap_desc',
                'per_page': per_page,
                'page': 1,
                'sparkline': 'false'
            },
            headers=headers
        )
        if response.status_code != 200:
            return jsonify({"error": "Erro ao buscar criptomoedas"}), 400

        cryptos = response.json()

        conn = get_db_connection()
        cursor = conn.cursor()
        for crypto in cryptos:
            # A API retorna 'price_change_percentage_24h_in_currency' quando se usa 'x-cg-demo-api-key'
            price_change = crypto.get('price_change_percentage_24h_in_currency', 0.0)

            cursor.execute('''
                INSERT OR REPLACE INTO cryptos (id, name, price, price_change_percentage_24h)
                VALUES (?, ?, ?, ?)
            ''', (crypto["id"], crypto["name"], crypto["current_price"], price_change))
        conn.commit()
        conn.close()

        return jsonify(cryptos)
    except Exception as e:
        return jsonify({"error": str(e)}), 500