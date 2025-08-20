from app.utils.database import get_db_connection
from flask import jsonify
from app.extensions import socketio

def analyze_market():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, name, price, price_change_percentage_24h FROM cryptos ORDER BY timestamp DESC LIMIT 100')
        cryptos = cursor.fetchall()
        conn.close()

        if not cryptos:
            return jsonify({"message": "Dados insuficientes para análise."}), 404

        # --- 1. Lógica de Análise Original para o Dashboard ---
        recommendations = []
        for crypto in cryptos:
            price = crypto['price']
            change = crypto['price_change_percentage_24h'] or 0
            
            action = "hold"
            reason = "Preço estável, sem grandes variações."

            if change > 5.0: # Subiu mais de 5%
                action = "sell"
                reason = f"Alta de {change:.2f}% nas últimas 24h."
            elif change < -5.0: # Caiu mais de 5%
                action = "buy"
                reason = f"Queda de {change:.2f}% nas últimas 24h, pode ser uma oportunidade."

            recommendations.append({
                "id": crypto['id'],
                "name": crypto['name'],
                "price": price,
                "action": action,
                "reason": reason
            })

        # Salva a análise original no banco
        conn = get_db_connection()
        cursor = conn.cursor()
        # Limpa análises antigas para não poluir
        cursor.execute('DELETE FROM analysis')
        for r in recommendations:
            cursor.execute('INSERT INTO analysis (crypto_id, action, reason) VALUES (?, ?, ?)', (r["id"], r["action"], r["reason"]))
        conn.commit()
        conn.close()

        # Emite o evento para o dashboard
        socketio.emit('analysis_update', {'recommendations': recommendations})

        # --- 2. Lógica de Resumo para a Página Inicial ---
        highest_gain = max(cryptos, key=lambda x: x['price_change_percentage_24h'] or -100)
        lowest_loss = min(cryptos, key=lambda x: x['price_change_percentage_24h'] or 100)
        buy_opportunity = next((c for c in sorted(cryptos, key=lambda x: x['price_change_percentage_24h'] or 100) if (c['price_change_percentage_24h'] or 0) < -5.0), None)

        analysis_summary = {
            'highest_gain': {
                'name': highest_gain['name'],
                'change': f"{highest_gain['price_change_percentage_24h']:.2f}%"
            },
            'lowest_loss': {
                'name': lowest_loss['name'],
                'change': f"{lowest_loss['price_change_percentage_24h']:.2f}%"
            },
            'buy_opportunity': {
                'name': buy_opportunity['name'],
                'reason': f"Queda de {buy_opportunity['price_change_percentage_24h']:.2f}%"
            } if buy_opportunity else None
        }

        # Emite o evento para a página inicial
        socketio.emit('market_summary_update', analysis_summary)

        return jsonify({"status": "Análise concluída", "summary": analysis_summary})

    except Exception as e:
        print(f"Erro ao analisar mercado: {str(e)}")
        return jsonify({"error": str(e)}), 500