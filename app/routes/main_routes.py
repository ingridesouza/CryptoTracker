from flask import Blueprint, render_template
from flask_login import login_required

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
@login_required
def index():
    return render_template('index.html')

@main_bp.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@main_bp.route('/search')
@login_required
def search():
    return render_template('search.html')

@main_bp.route('/portfolio')
@login_required
def portfolio():
    return render_template('portfolio.html')

@main_bp.route('/coin/<crypto_id>')
@login_required
def coin_detail(crypto_id):
    return render_template('coin.html', crypto_id=crypto_id)

@main_bp.route('/alerts')
@login_required
def alerts():
    return render_template('alerts.html')

@main_bp.route('/tax')
@login_required
def tax():
    return render_template('tax.html')

@main_bp.route('/exchanges')
@login_required
def exchanges():
    return render_template('exchanges.html')
