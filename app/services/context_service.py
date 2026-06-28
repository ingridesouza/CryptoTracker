"""
context_service.py

Builds a rich, structured context block about the current user and market
to be injected into the AI system prompt before every response.
"""

from app.utils.database import get_db_connection
from app.services.coingecko_service import get_top_cryptos, get_current_prices, _get as cache_get
from app.services.global_service import get_global_stats, get_fear_greed


def build_user_context(user_id: int) -> str:
    """Return a markdown-formatted context block for the LLM system prompt."""
    sections = []

    # ── Market snapshot ──────────────────────────────────────
    market = _market_snapshot()
    if market:
        sections.append(market)

    # ── User portfolio ───────────────────────────────────────
    portfolio = _portfolio_context(user_id)
    if portfolio:
        sections.append(portfolio)

    # ── Active alerts ────────────────────────────────────────
    alerts = _alerts_context(user_id)
    if alerts:
        sections.append(alerts)

    return "\n\n".join(sections)


# ── Private helpers ──────────────────────────────────────────

def _market_snapshot() -> str:
    lines = []

    # Fear & Greed
    try:
        fg = get_fear_greed()
        lines.append(f"- Fear & Greed Index: {fg['value']}/100 ({fg['label']})")
    except Exception:
        pass

    # Global stats
    try:
        g = get_global_stats()
        if not g.get('error'):
            mcap = _fmt_large(g.get('total_market_cap_usd', 0))
            vol  = _fmt_large(g.get('total_volume_usd', 0))
            chg  = g.get('market_cap_change_24h', 0)
            sign = '+' if chg >= 0 else ''
            lines.append(f"- Capitalização total do mercado: {mcap} ({sign}{chg}% em 24h)")
            lines.append(f"- Volume total 24h: {vol}")
            lines.append(f"- Dominância BTC: {g.get('btc_dominance')}% | ETH: {g.get('eth_dominance')}%")
    except Exception:
        pass

    # Top 5 prices from cache (avoid extra API call)
    try:
        cached = cache_get('top_cryptos:20:usd') or cache_get('top_cryptos:10:usd')
        if isinstance(cached, list) and cached:
            top5 = cached[:5]
            coin_lines = []
            for c in top5:
                price = c.get('current_price', 0)
                ch24  = c.get('price_change_percentage_24h', 0) or 0
                sign  = '+' if ch24 >= 0 else ''
                coin_lines.append(
                    f"  {c.get('symbol','').upper()}: ${price:,.2f} ({sign}{ch24:.2f}% 24h)"
                )
            lines.append("- Top moedas agora:\n" + "\n".join(coin_lines))
    except Exception:
        pass

    if not lines:
        return ""
    return "**Mercado atual:**\n" + "\n".join(lines)


def _portfolio_context(user_id: int) -> str:
    try:
        conn = get_db_connection()
        holdings = conn.execute(
            'SELECT * FROM portfolio WHERE user_id = ?', (user_id,)
        ).fetchall()
        conn.close()

        if not holdings:
            return "**Portfolio do usuário:** vazio (nenhuma posição cadastrada ainda)."

        crypto_ids = list({h['crypto_id'] for h in holdings})
        prices = get_current_prices(crypto_ids)

        lines = []
        total_cost = total_value = 0.0

        for h in holdings:
            cp = prices.get(h['crypto_id'], {}).get('usd', 0)
            cost  = h['amount'] * h['purchase_price']
            value = h['amount'] * cp
            pnl   = value - cost
            pnl_p = (pnl / cost * 100) if cost else 0
            total_cost  += cost
            total_value += value
            sign = '+' if pnl >= 0 else ''
            lines.append(
                f"  {h['crypto_name']}: {h['amount']} unidades | "
                f"compra ${h['purchase_price']:,.2f} | atual ${cp:,.2f} | "
                f"P&L {sign}${pnl:,.2f} ({sign}{pnl_p:.2f}%)"
            )

        total_pnl   = total_value - total_cost
        total_pnl_p = (total_pnl / total_cost * 100) if total_cost else 0
        sign = '+' if total_pnl >= 0 else ''

        summary = (
            f"  Total investido: ${total_cost:,.2f} | "
            f"Valor atual: ${total_value:,.2f} | "
            f"Resultado: {sign}${total_pnl:,.2f} ({sign}{total_pnl_p:.2f}%)"
        )
        return (
            f"**Portfolio do usuário ({len(holdings)} posição(ões)):**\n"
            + "\n".join(lines)
            + f"\n  — Resumo: {summary}"
        )
    except Exception:
        return ""


def _alerts_context(user_id: int) -> str:
    try:
        conn = get_db_connection()
        alerts = conn.execute(
            'SELECT * FROM alerts WHERE user_id = ? AND active = 1', (user_id,)
        ).fetchall()
        conn.close()

        if not alerts:
            return "**Alertas de preço ativos:** nenhum."

        cond_map = {'above': 'acima de', 'below': 'abaixo de'}
        lines = [
            f"  {a['crypto_name']}: notificar quando {cond_map.get(a['condition'], a['condition'])} ${a['target_price']:,.2f}"
            for a in alerts
        ]
        return f"**Alertas de preço ativos ({len(alerts)}):**\n" + "\n".join(lines)
    except Exception:
        return ""


def _fmt_large(n: float) -> str:
    if n >= 1e12: return f"${n/1e12:.2f}T"
    if n >= 1e9:  return f"${n/1e9:.2f}B"
    if n >= 1e6:  return f"${n/1e6:.2f}M"
    return f"${n:,.0f}"
