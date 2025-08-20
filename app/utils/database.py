import sqlite3

def get_db_connection():
    conn = sqlite3.connect('crypto_analysis.db')
    conn.row_factory = sqlite3.Row
    return conn

def initialize_database():
    conn = get_db_connection()
    cursor = conn.cursor()
    # Cria a tabela caso não exista
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cryptos (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            price_change_percentage_24h REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Garante que a coluna price_change_percentage_24h exista
    cursor.execute("PRAGMA table_info(cryptos)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'price_change_percentage_24h' not in columns:
        cursor.execute('ALTER TABLE cryptos ADD COLUMN price_change_percentage_24h REAL')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            crypto_id TEXT NOT NULL,
            action TEXT NOT NULL,  -- "buy", "sell", "hold"
            reason TEXT NOT NULL,  -- Motivo da recomendação
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (crypto_id) REFERENCES cryptos (id)
        )
    ''')
    conn.commit()
    conn.close()