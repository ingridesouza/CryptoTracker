from flask import Flask
from flask_caching import Cache
from flask_cors import CORS  # Importação do CORS
from .extensions import socketio
import os

cache = Cache()

def create_app():
    app = Flask(__name__)
    
    # Configurações
    app.config['COINGECKO_API_KEY'] = os.getenv("API_COINGECKO")
    app.config['COINGECKO_API_URL'] = "https://api.coingecko.com/api/v3"
    app.config['DEEPSEEK_API_KEY'] = os.getenv("API_DEEPSEEK")  # Adicione a chave da API do DeepSeek
    app.config['DEEPSEEK_API_URL'] = "https://api.deepseek.com/chat/completions"  # Adicione a URL da API do DeepSeek
    
    # Inicializa o banco de dados (cria/migra tabelas)
    from app.utils.database import initialize_database
    initialize_database()

    # --------- Tarefa em segundo plano para atualização automática ---------
    def background_updater():
        from time import sleep
        from app.services.coingecko_service import get_top_cryptos
        from app.services.analysis_service import analyze_market
        while True:
            try:
                with app.app_context():
                    get_top_cryptos()
                    analyze_market()
            except Exception as e:
                app.logger.error(f"Erro no background_updater: {e}")
            sleep(300)  # a cada 5 minutos

    socketio.start_background_task(background_updater)

    # Inicializa o cache
    cache.init_app(app, config={'CACHE_TYPE': 'simple'})

    # Inicializa o SocketIO
    socketio.init_app(app, cors_allowed_origins="*")
    
    # Configura o CORS
    CORS(app)  # Configura o CORS antes de registrar os blueprints
    
    # Registra blueprints
    from app.routes.main_routes import main_bp
    from app.routes.crypto_routes import crypto_bp
    from app.routes.analysis_routes import analysis_bp
    from app.routes.chat_routes import chat_bp  # Importação do chat_bp
    
    app.register_blueprint(main_bp)
    app.register_blueprint(crypto_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(chat_bp, url_prefix='/api')  # Registra o chat_bp com o prefixo '/api'
    
    @app.context_processor
    def inject_chat():
        return dict(include_chat=True)
    
    return app