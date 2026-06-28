/* search.js — Search page */

document.getElementById('search-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = document.getElementById('search-input')?.value.trim()
         || document.getElementById('search')?.value.trim();
  if (!q) return;

  const area = document.getElementById('search-result-area') || document.getElementById('search-result');
  if (!area) return;

  area.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px"><i class="fa-solid fa-spinner fa-spin"></i> Buscando...</p>';

  try {
    const r = await fetch(`/crypto/${encodeURIComponent(q)}`);
    if (!r.ok) {
      area.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:12px;opacity:.3"><i class="fa-solid fa-magnifying-glass"></i></div>
        <p style="font-size:14px;font-weight:600">Nenhum resultado para "${q}"</p>
        <p style="font-size:12px;margin-top:4px">Tente o ID exato (ex: bitcoin, ethereum)</p>
      </div>`;
      return;
    }
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    const price = d.market_data?.current_price?.usd || 0;
    const ch24h = d.market_data?.price_change_percentage_24h || 0;
    const chCls = ch24h >= 0 ? 'change-up' : 'change-down';

    area.innerHTML = `
      <div class="card" style="display:flex;gap:20px;align-items:flex-start;cursor:pointer" onclick="window.location='/coin/${d.id}'">
        <img src="${d.image?.large || ''}" alt="${d.name}" style="width:72px;height:72px;border-radius:50%;flex-shrink:0">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
            <span style="font-size:20px;font-weight:800">${d.name}</span>
            <span style="font-size:13px;font-family:var(--font-mono);color:var(--text-secondary);font-weight:600">${d.symbol?.toUpperCase()}</span>
            ${d.market_cap_rank ? `<span class="badge">#${d.market_cap_rank}</span>` : ''}
          </div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px">
            <span style="font-size:28px;font-family:var(--font-mono);font-weight:700">
              ${price >= 1 ? '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$' + price.toFixed(8)}
            </span>
            <span class="${chCls}" style="font-family:var(--font-mono);font-size:15px;font-weight:600">
              ${ch24h >= 0 ? '▲' : '▼'} ${Math.abs(ch24h).toFixed(2)}%
            </span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
            <div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em">Market Cap</div>
              <div style="font-weight:600">${window.fmtUSD ? window.fmtUSD(d.market_data?.market_cap?.usd) : '—'}</div></div>
            <div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em">Volume 24h</div>
              <div style="font-weight:600">${window.fmtUSD ? window.fmtUSD(d.market_data?.total_volume?.usd) : '—'}</div></div>
            <div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em">Máx. Histórico</div>
              <div style="font-weight:600">${window.fmtUSD ? window.fmtUSD(d.market_data?.ath?.usd) : '—'}</div></div>
          </div>
          <div style="margin-top:16px">
            <a href="/coin/${d.id}" class="btn btn-primary btn-sm">Ver Detalhes <i class="fa-solid fa-arrow-right"></i></a>
          </div>
        </div>
      </div>`;
  } catch (e) {
    area.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--accent-red)">Erro: ${e.message}</div>`;
  }
});
