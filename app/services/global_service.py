import requests
import os
import time

BASE = 'https://api.coingecko.com/api/v3'

_cache: dict = {}

def _get(key):
    entry = _cache.get(key)
    if entry and (time.time() - entry['ts']) < entry['ttl']:
        return entry['data']
    return None

def _set(key, data, ttl):
    _cache[key] = {'data': data, 'ts': time.time(), 'ttl': ttl}

def _headers():
    key = os.getenv('API_COINGECKO')
    return {'x-cg-demo-api-key': key} if key else {}


def get_global_stats():
    cached = _get('global_stats')
    if cached is not None:
        return cached

    try:
        resp = requests.get(f'{BASE}/global', headers=_headers(), timeout=10)
        resp.raise_for_status()
        d = resp.json().get('data', {})
        data = {
            'total_market_cap_usd': d.get('total_market_cap', {}).get('usd', 0),
            'total_volume_usd': d.get('total_volume', {}).get('usd', 0),
            'btc_dominance': round(d.get('market_cap_percentage', {}).get('btc', 0), 1),
            'eth_dominance': round(d.get('market_cap_percentage', {}).get('eth', 0), 1),
            'active_cryptos': d.get('active_cryptocurrencies', 0),
            'market_cap_change_24h': round(d.get('market_cap_change_percentage_24h_usd', 0), 2),
        }
        _set('global_stats', data, ttl=300)
        return data
    except Exception as e:
        return {'error': str(e)}


def get_fear_greed():
    cached = _get('fear_greed')
    if cached is not None:
        return cached

    try:
        resp = requests.get('https://api.alternative.me/fng/?limit=1', timeout=8)
        resp.raise_for_status()
        item = resp.json()['data'][0]
        data = {'value': int(item['value']), 'label': item['value_classification']}
        _set('fear_greed', data, ttl=300)
        return data
    except Exception:
        return {'value': 50, 'label': 'Neutral'}


def get_trending():
    cached = _get('trending')
    if cached is not None:
        return cached

    try:
        resp = requests.get(f'{BASE}/search/trending', headers=_headers(), timeout=10)
        resp.raise_for_status()
        coins = resp.json().get('coins', [])
        data = [
            {
                'id': c['item']['id'],
                'name': c['item']['name'],
                'symbol': c['item']['symbol'].upper(),
                'thumb': c['item'].get('thumb', ''),
                'market_cap_rank': c['item'].get('market_cap_rank'),
                'price_btc': c['item'].get('price_btc', 0),
            }
            for c in coins[:7]
        ]
        _set('trending', data, ttl=300)
        return data
    except Exception:
        return []
