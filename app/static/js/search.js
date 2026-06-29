/* search.js — Explorar page: trending, movers, quick chips */

const chipsEl    = document.getElementById('quick-chips-search');
const trendingEl = document.getElementById('trending-home');
const moversEl   = document.getElementById('movers-home');

const QUICK = [
  { label: 'BTC',  id: 'bitcoin' },
  { label: 'ETH',  id: 'ethereum' },
  { label: 'SOL',  id: 'solana' },
  { label: 'BNB',  id: 'binancecoin' },
  { label: 'XRP',  id: 'ripple' },
  { label: 'ADA',  id: 'cardano' },
  { label: 'DOGE', id: 'dogecoin' },
  { label: 'AVAX', id: 'avalanche-2' },
];

function fmtPrice(n) {
  if (!n) return '—';
  return n >= 1
    ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '$' + n.toFixed(6);
}

/* Quick chips */
if (chipsEl) {
  chipsEl.innerHTML = QUICK.map(c =>
    `<button class="quick-chip" onclick="window.location='/coin/${c.id}'">${c.label}</button>`
  ).join('');
}

/* Movers */
let allMovers = [];
let activeMoverTab = 'gainers';

function renderMovers(tab) {
  if (!moversEl || !allMovers.length) return;
  const sorted = [...allMovers].sort((a, b) =>
    tab === 'gainers'
      ? b.price_change_percentage_24h - a.price_change_percentage_24h
      : a.price_change_percentage_24h - b.price_change_percentage_24h
  ).slice(0, 7);

  moversEl.innerHTML = sorted.map(c => {
    const ch  = c.price_change_percentage_24h || 0;
    const cls = ch >= 0 ? 'change-up' : 'change-down';
    return `
      <div class="mover-row" onclick="window.location='/coin/${c.id}'">
        <img src="${c.image || ''}" style="width:28px;height:28px;border-radius:50%;flex-shrink:0"
             onerror="this.style.display='none'">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${c.name}</div>
          <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">${(c.symbol||'').toUpperCase()}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;font-family:var(--font-mono);color:var(--text-primary)">${fmtPrice(c.current_price)}</div>
          <div class="${cls}" style="font-size:11px;font-family:var(--font-mono);font-weight:600">
            ${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(2)}%
          </div>
        </div>
      </div>`;
  }).join('');
}

async function loadData() {
  try {
    const [globalResp, topResp] = await Promise.all([
      fetch('/api/global'),
      fetch('/get-top-cryptos?limit=20'),
    ]);

    if (globalResp.ok && trendingEl) {
      const g = await globalResp.json();
      const trending = g.trending || [];
      if (trending.length) {
        trendingEl.innerHTML = trending.slice(0, 7).map((c, i) => `
          <div class="trending-row" onclick="window.location='/coin/${c.id}'">
            ${c.thumb
              ? `<img src="${c.thumb}" style="width:28px;height:28px;border-radius:50%;flex-shrink:0" onerror="this.style.display='none'">`
              : `<div style="width:28px;height:28px;border-radius:50%;background:var(--bg-hover);flex-shrink:0"></div>`}
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${c.name}</div>
              <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">${c.symbol?.toUpperCase()}</div>
            </div>
            <span style="font-size:11px;color:var(--text-muted)">#${i + 1}</span>
          </div>`).join('');
      } else {
        trendingEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Sem dados</div>`;
      }
    }

    if (topResp.ok) {
      const top = await topResp.json();
      if (Array.isArray(top) && top.length) {
        allMovers = top.filter(c => c.price_change_percentage_24h != null);
        renderMovers(activeMoverTab);
      } else {
        if (moversEl) moversEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Sem dados disponíveis</div>`;
      }
    } else {
      if (moversEl) moversEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Sem dados disponíveis</div>`;
    }
  } catch {
    if (moversEl) moversEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Sem dados disponíveis</div>`;
  }
}

document.querySelectorAll('.mover-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mover-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMoverTab = btn.dataset.tab;
    renderMovers(activeMoverTab);
  });
});

loadData();
