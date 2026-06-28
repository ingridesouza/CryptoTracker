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


def get_price_history(crypto_id, days=30, currency='usd'):
    cache_key = f'history:{crypto_id}:{days}:{currency}'
    cached = _get(cache_key)
    if cached is not None:
        return cached

    try:
        resp = requests.get(
            f'{BASE}/coins/{crypto_id}/market_chart',
            params={'vs_currency': currency, 'days': days},
            headers=_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        raw = resp.json()
        data = {
            'prices': raw.get('prices', []),
            'market_caps': raw.get('market_caps', []),
            'volumes': raw.get('total_volumes', []),
        }
        # Longer TTL for longer periods — daily data doesn't change minute-to-minute
        ttl = 120 if days <= 1 else 300
        _set(cache_key, data, ttl=ttl)
        return data
    except Exception as e:
        return {'error': str(e), 'prices': [], 'market_caps': [], 'volumes': []}
