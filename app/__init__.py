from flask import Flask
from flask_caching import Cache
from flask_cors import CORS
from .extensions import socketio, login_manager
import os

cache = Cache()

def create_app():
    app = Flask(__name__)

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'ct-dev-secret-2025-change-in-prod')
    app.config['COINGECKO_API_KEY'] = os.getenv('API_COINGECKO')
    app.config['COINGECKO_API_URL'] = 'https://api.coingecko.com/api/v3'
    app.config['DEEPSEEK_API_KEY'] = os.getenv('API_DEEPSEEK')
    app.config['DEEPSEEK_API_URL'] = 'https://api.deepseek.com/chat/completions'

    from app.utils.database import initialize_database
    initialize_database()

    cache.init_app(app, config={'CACHE_TYPE': 'simple'})
    socketio.init_app(app, cors_allowed_origins='*')
    login_manager.init_app(app)
    CORS(app)

    # Background task: market data + alerts every 60s
    def background_updater():
        from time import sleep
        from app.services.coingecko_service import get_top_cryptos
        from app.services.analysis_service import analyze_market
        from app.services.alert_service import check_alerts
        while True:
            try:
                with app.app_context():
                    get_top_cryptos()
                    analyze_market()
                    check_alerts(socketio, app)
            except Exception as e:
                app.logger.error(f'background_updater error: {e}')
            sleep(300)

    # Background task: ticker tape every 120s
    def ticker_updater():
        from time import sleep
        from app.services.coingecko_service import get_top_cryptos
        while True:
            try:
                with app.app_context():
                    data = get_top_cryptos(limit=10)
                    if isinstance(data, list):
                        ticker = [
                            {
                                'id': c.get('id'),
                                'symbol': c.get('symbol', '').upper(),
                                'price': c.get('current_price', 0),
                                'change': round(c.get('price_change_percentage_24h', 0) or 0, 2),
                            }
                            for c in data
                        ]
                        socketio.emit('ticker_update', ticker)
            except Exception as e:
                app.logger.error(f'ticker_updater error: {e}')
            sleep(120)

    socketio.start_background_task(background_updater)
    socketio.start_background_task(ticker_updater)

    from app.routes.main_routes import main_bp
    from app.routes.crypto_routes import crypto_bp
    from app.routes.analysis_routes import analysis_bp
    from app.routes.chat_routes import chat_bp
    from app.routes.auth_routes import auth_bp
    from app.routes.portfolio_routes import portfolio_bp
    from app.routes.alert_routes import alert_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(crypto_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(chat_bp, url_prefix='/api')
    app.register_blueprint(auth_bp)
    app.register_blueprint(portfolio_bp)
    app.register_blueprint(alert_bp)

    @app.context_processor
    def inject_globals():
        from flask_login import current_user
        return dict(include_chat=True, current_user=current_user)

    return app
