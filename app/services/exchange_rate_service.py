import requests
from datetime import datetime, timedelta

_cache = {}

def get_usd_brl():
    now = datetime.utcnow()
    cached = _cache.get('usd_brl')
    if cached and now - cached['ts'] < timedelta(minutes=5):
        return cached['rate']
    try:
        resp = requests.get(
            'https://economia.awesomeapi.com.br/json/last/USD-BRL',
            timeout=5
        )
        resp.raise_for_status()
        rate = float(resp.json()['USDBRL']['bid'])
        _cache['usd_brl'] = {'rate': rate, 'ts': now}
        return rate
    except Exception:
        return cached['rate'] if cached else 5.70
