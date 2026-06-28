/* market.js — Home market table + converter + global data */

let marketData = [];
let refreshInterval;

async function loadMarket() {
  const limit    = document.getElementById('market-limit')?.value    || 20;
  const currency = document.getElementById('market-currency')?.value || 'usd';

  try {
    const r = await fetch(`/get-top-cryptos?limit=${limit}&currency=${currency}`);
    if (!r.ok) return;
    marketData = await r.json();
    if (!Array.isArray(marketData)) return;
    renderTable(marketData, currency);
  } catch (e) { console.error('loadMarket', e); }
}

function renderTable(data, currency = 'usd') {
  const tbody = document.getElementById('market-tbody');
  if (!tbody) return;

  const sym = { usd: '$', brl: 'R$', eur: '€' }[currency] || '$';

  tbody.innerHTML = data.map((c, i) => {
    const price  = c.current_price ?? 0;
    const ch1h   = c.price_change_percentage_1h_in_currency;
    const ch24h  = c.price_change_percentage_24h;
    const ch7d   = c.price_change_percentage_7d_in_currency;
    const sparkPrices = (c.sparkline_in_7d?.price || []).filter((_, j, a) => j % Math.ceil(a.length / 20) === 0);
    const spark  = window.sparklineSVG ? window.sparklineSVG(sparkPrices, (ch7d ?? ch24h ?? 0) >= 0) : '';

    const fmtPrice = price >= 1 ? sym + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                 : sym + price.toFixed(6);

    return `<tr class="coin-row" onclick="window.location='/coin/${c.id}'">
      <td class="coin-rank">${c.market_cap_rank || i + 1}</td>
      <td>
        <div class="coin-info">
          <img class="coin-img" src="${c.image}" alt="${c.name}" loading="lazy">
          <div>
            <div class="coin-name-text">${c.name}</div>
            <div class="coin-symbol">${c.symbol?.toUpperCase()}</div>
          </div>
        </div>
      </td>
      <td class="coin-price">${fmtPrice}</td>
      <td>${window.fmtPct ? window.fmtPct(ch1h) : '—'}</td>
      <td>${window.fmtPct ? window.fmtPct(ch24h) : '—'}</td>
      <td>${window.fmtPct ? window.fmtPct(ch7d) : '—'}</td>
      <td class="coin-mcap hide-mobile">${window.fmtUSD ? window.fmtUSD(c.market_cap) : '—'}</td>
      <td class="coin-volume hide-mobile">${window.fmtUSD ? window.fmtUSD(c.total_volume) : '—'}</td>
      <td class="hide-mobile">${spark}</td>
    </tr>`;
  }).join('');
}

async function loadGlobal() {
  try {
    const r = await fetch('/api/global');
    if (!r.ok) return;
    const d = await r.json();
    const s = d.stats || {};
    const fg = d.fear_greed || {};
    const trending = d.trending || [];

    // Global stats
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('g-mcap',   window.fmtUSD ? window.fmtUSD(s.total_market_cap_usd) : '—');
    set('g-vol',    window.fmtUSD ? window.fmtUSD(s.total_volume_usd) : '—');
    set('g-btc',    s.btc_dominance != null ? s.btc_dominance + '%' : '—');
    set('g-eth',    s.eth_dominance != null ? s.eth_dominance + '%' : '—');
    set('g-count',  s.active_cryptos ? s.active_cryptos.toLocaleString() : '—');
    const chEl = document.getElementById('g-change');
    if (chEl && s.market_cap_change_24h != null) {
      const v = s.market_cap_change_24h;
      chEl.innerHTML = `<span class="${v >= 0 ? 'change-up' : 'change-down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(2)}%</span>`;
    }

    // Fear & Greed
    if (fg.value != null) {
      const val = fg.value;
      document.getElementById('fg-value').textContent = val;
      document.getElementById('fg-label').textContent = fg.label || '';
      // Arc: circumference ~157 for our path
      const fill = (val / 100) * 157;
      const arc = document.getElementById('fg-arc-fill');
      if (arc) {
        arc.setAttribute('stroke-dasharray', `${fill} 157`);
        const color = val < 25 ? 'var(--accent-red)' : val < 45 ? 'var(--accent-orange)' : val < 55 ? 'var(--accent-yellow)' : val < 75 ? 'var(--accent-blue)' : 'var(--accent-green)';
        arc.setAttribute('stroke', color);
      }
    }

    // Trending
    const tList = document.getElementById('trending-list');
    if (tList && trending.length) {
      tList.innerHTML = trending.map(c => `
        <div class="trending-item" onclick="window.location='/coin/${c.id}'" style="cursor:pointer">
          <img class="trending-thumb" src="${c.thumb}" alt="${c.name}" onerror="this.style.display='none'">
          <div>
            <div class="trending-name">${c.name}</div>
            <div class="trending-symbol">${c.symbol}</div>
          </div>
          ${c.market_cap_rank ? `<span class="trending-rank">#${c.market_cap_rank}</span>` : ''}
        </div>`).join('');
    }
  } catch (e) { console.error('loadGlobal', e); }
}

/* ── Converter ───────────────────────────────────────────── */
function initConverter() {
  const convBtn   = document.getElementById('conv-btn');
  const convSwap  = document.getElementById('conv-swap');
  const convResult = document.getElementById('conv-result');

  async function doConvert() {
    const amount   = parseFloat(document.getElementById('conv-amount')?.value) || 0;
    const fromId   = document.getElementById('conv-from')?.value;
    const toCur    = document.getElementById('conv-to')?.value;
    if (!amount || !fromId || !toCur) return;

    convResult.innerHTML = '<span style="color:var(--text-muted)"><i class="fa-solid fa-spinner fa-spin"></i> Convertendo...</span>';
    try {
      const r = await fetch(`/api/convert?from_id=${fromId}&to=${toCur}&amount=${amount}`);
      const d = await r.json();
      if (d.error) { convResult.innerHTML = `<span style="color:var(--accent-red)">${d.error}</span>`; return; }

      const sym = { usd: '$', brl: 'R$', eur: '€' }[toCur] || '';
      const result = d.result;
      const formatted = typeof result === 'number'
        ? (result >= 1 ? sym + result.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : sym + result.toFixed(8))
        : '—';

      convResult.innerHTML = `
        <div>
          <div class="converter-result-val">${formatted}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">
            1 ${fromId} = ${sym}${d.rate?.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${toCur.toUpperCase()}
          </div>
        </div>`;
    } catch {
      convResult.innerHTML = '<span style="color:var(--accent-red)">Erro ao converter</span>';
    }
  }

  if (convBtn) convBtn.addEventListener('click', doConvert);

  if (convSwap) {
    convSwap.addEventListener('click', () => {
      const from = document.getElementById('conv-from');
      const to   = document.getElementById('conv-to');
      const tmp  = from.value; from.value = to.value; to.value = tmp;
    });
  }
}

/* ── Controls ────────────────────────────────────────────── */
document.getElementById('market-limit')?.addEventListener('change', loadMarket);
document.getElementById('market-currency')?.addEventListener('change', loadMarket);

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadMarket();
  loadGlobal();
  initConverter();
  // Refresh market every 120s (respects CoinGecko free tier rate limits)
  refreshInterval = setInterval(loadMarket, 120000);
});

// Live ticker can also refresh table
if (typeof socket !== 'undefined') {
  socket.on('ticker_update', () => {
    clearInterval(refreshInterval);
    refreshInterval = setInterval(loadMarket, 30000);
  });
}
