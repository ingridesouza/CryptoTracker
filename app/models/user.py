from flask_login import UserMixin
from app.utils.database import get_db_connection

class User(UserMixin):
    def __init__(self, id, username, email, currency_pref='usd'):
        self.id = id
        self.username = username
        self.email = email
        self.currency_pref = currency_pref

    @staticmethod
    def get_by_id(user_id):
        conn = get_db_connection()
        row = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        conn.close()
        if row:
            return User(row['id'], row['username'], row['email'], row['currency_pref'])
        return None

    @staticmethod
    def get_by_email(email):
        conn = get_db_connection()
        row = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        conn.close()
        return row

    @staticmethod
    def get_by_username(username):
        conn = get_db_connection()
        row = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        conn.close()
        return row
