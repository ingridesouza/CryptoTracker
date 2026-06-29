/* search.js — Search page: home state + multi-result search */

const form        = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const area        = document.getElementById('search-result-area');

if (!form || !area) throw new Error('search.js: missing DOM elements');

/* ── Skeleton while loading ──────────────────────────────── */
function showSkeleton() {
  area.innerHTML = Array.from({ length: 4 }, () => `
    <div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)">
      <div class="skeleton" style="width:36px;height:36px;border-radius:50%;flex-shrink:0"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <div class="skeleton skeleton-cell" style="width:140px;height:14px"></div>
        <div class="skeleton skeleton-cell" style="width:60px;height:11px"></div>
      </div>
      <div class="skeleton skeleton-cell" style="width:50px;height:14px"></div>
    </div>`).join('');
}

/* ── Empty state ─────────────────────────────────────────── */
function showEmpty(q) {
  area.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
      <div class="empty-title">Nenhum resultado para "${q}"</div>
      <div class="empty-desc">Verifique o nome ou símbolo e tente novamente.</div>
    </div>`;
}

/* ── Result list (candidates) ────────────────────────────── */
function showCandidates(results, q) {
  area.innerHTML = `
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">${results.length} resultado${results.length !== 1 ? 's' : ''} para "${q}"</div>
    <div class="card" style="padding:0;overflow:hidden">
      ${results.map((c, i) => `
        <div class="search-candidate" data-id="${c.id}" style="
          display:flex;align-items:center;gap:14px;
          padding:13px 18px;cursor:pointer;
          border-bottom:${i < results.length - 1 ? '1px solid var(--border)' : 'none'};
          transition:background var(--transition);"
          onmouseenter="this.style.background='var(--bg-hover)'"
          onmouseleave="this.style.background=''"
        >
          ${c.thumb
            ? `<img src="${c.thumb}" alt="${c.name}" style="width:32px;height:32px;border-radius:50%;flex-shrink:0" onerror="this.style.visibility='hidden'">`
            : `<div style="width:32px;height:32px;border-radius:50%;background:var(--bg-hover);flex-shrink:0"></div>`}
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${c.name}</div>
            <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">${c.symbol}</div>
          </div>
          ${c.rank ? `<span style="font-size:11px;color:var(--text-muted)">#${c.rank}</span>` : ''}
          <i class="fa-solid fa-chevron-right" style="font-size:10px;color:var(--text-muted)"></i>
        </div>`).join('')}
    </div>`;

  area.querySelectorAll('.search-candidate').forEach(el => {
    el.addEventListener('click', () => loadDetail(el.dataset.id));
  });
}

/* ── Coin detail ─────────────────────────────────────────── */
async function loadDetail(id) {
  area.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:32px"><i class="fa-solid fa-spinner fa-spin"></i></p>`;

  try {
    const r = await fetch(`/api/coin/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error('Não encontrado');
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    const price  = d.market_data?.current_price?.usd || 0;
    const ch24h  = d.market_data?.price_change_percentage_24h || 0;
    const chCls  = ch24h >= 0 ? 'change-up' : 'change-down';
    const arrow  = ch24h >= 0 ? '▲' : '▼';
    const fmtP   = n => n >= 1
      ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '$' + n.toFixed(8);
    const fmtBig = n => {
      if (!n) return '—';
      if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
      if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
      if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
      return '$' + n.toLocaleString();
    };

    area.innerHTML = `
      <button onclick="area.innerHTML='';showHome()" class="btn btn-ghost btn-sm" style="margin-bottom:16px">
        <i class="fa-solid fa-arrow-left"></i> Voltar
      </button>
      <div class="card">
        <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
          <img src="${d.image?.large || ''}" alt="${d.name}"
               style="width:64px;height:64px;border-radius:50%;flex-shrink:0"
               onerror="this.style.display='none'">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
              <span style="font-size:22px;font-weight:800;letter-spacing:-0.02em">${d.name}</span>
              <span style="font-size:13px;font-family:var(--font-mono);color:var(--text-secondary)">${d.symbol?.toUpperCase()}</span>
              ${d.market_cap_rank ? `<span class="badge">#${d.market_cap_rank}</span>` : ''}
            </div>
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:20px;flex-wrap:wrap">
              <span style="font-size:30px;font-family:var(--font-mono);font-weight:700">${fmtP(price)}</span>
              <span class="${chCls}" style="font-family:var(--font-mono);font-size:15px;font-weight:600">
                ${arrow} ${Math.abs(ch24h).toFixed(2)}%
              </span>
              <span style="font-size:11px;color:var(--text-muted)">24h</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px">
              ${[
                ['Market Cap',    fmtBig(d.market_data?.market_cap?.usd)],
                ['Volume 24h',    fmtBig(d.market_data?.total_volume?.usd)],
                ['Máx. histórico',fmtP(d.market_data?.ath?.usd || 0)],
                ['Mín. histórico',fmtP(d.market_data?.atl?.usd || 0)],
                ['7d %', (() => {
                  const v = d.market_data?.price_change_percentage_7d;
                  return v != null ? `<span class="${v>=0?'change-up':'change-down'}">${v>=0?'▲':'▼'} ${Math.abs(v).toFixed(2)}%</span>` : '—';
                })()],
                ['30d %', (() => {
                  const v = d.market_data?.price_change_percentage_30d;
                  return v != null ? `<span class="${v>=0?'change-up':'change-down'}">${v>=0?'▲':'▼'} ${Math.abs(v).toFixed(2)}%</span>` : '—';
                })()],
              ].map(([label, val]) => `
                <div style="background:var(--bg-hover);border-radius:var(--radius-sm);padding:10px 13px">
                  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">${label}</div>
                  <div style="font-size:13px;font-weight:600;font-family:var(--font-mono)">${val}</div>
                </div>`).join('')}
            </div>
            <a href="/coin/${d.id}" class="btn btn-primary btn-sm">
              Ver gráfico <i class="fa-solid fa-arrow-right"></i>
            </a>
          </div>
        </div>
      </div>`;
  } catch (e) {
    area.innerHTML = `<div class="card empty-state">
      <div class="empty-icon"><i class="fa-solid fa-circle-exclamation"></i></div>
      <div class="empty-title">Erro ao carregar</div>
      <div class="empty-desc">${e.message}</div>
    </div>`;
  }
}

/* ── Form submit ─────────────────────────────────────────── */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) { showHome(); return; }

  hideHome();
  showSkeleton();

  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error('Falha na busca');
    const results = await r.json();
    if (!results.length) { showEmpty(q); return; }
    if (results.length === 1) { loadDetail(results[0].id); return; }
    showCandidates(results, q);
  } catch (e) {
    area.innerHTML = `<div class="card empty-state">
      <div class="empty-icon"><i class="fa-solid fa-circle-exclamation"></i></div>
      <div class="empty-title">Erro</div>
      <div class="empty-desc">${e.message}</div>
    </div>`;
  }
});

/* ── Keyboard: Enter direto se query bater exatamente ──────── */
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') form.dispatchEvent(new Event('submit'));
});

/* ── Home state ──────────────────────────────────────────── */
const homeEl       = document.getElementById('search-home');
const chipsEl      = document.getElementById('quick-chips-search');
const trendingEl   = document.getElementById('trending-home');
const moversEl     = document.getElementById('movers-home');

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

function showHome() {
  if (!homeEl) return;
  homeEl.style.display = '';
  area.innerHTML = '';
}

function hideHome() {
  if (homeEl) homeEl.style.display = 'none';
}

/* Quick chips */
if (chipsEl) {
  chipsEl.innerHTML = QUICK.map(c => `
    <button class="quick-chip" data-id="${c.id}">${c.label}</button>`).join('');
  chipsEl.querySelectorAll('.quick-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      hideHome();
      loadDetail(btn.dataset.id);
    });
  });
}

/* Trending */
let allMovers = [];
let activeMoverTab = 'gainers';

async function loadHomeData() {
  try {
    const [globalResp, topResp] = await Promise.all([
      fetch('/api/global'),
      fetch('/get-top-cryptos?limit=20'),
    ]);

    /* Trending */
    if (globalResp.ok && trendingEl) {
      const g = await globalResp.json();
      const trending = g.trending || [];
      if (trending.length && trendingEl) {
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
      } else if (trendingEl) {
        trendingEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Sem dados</div>`;
      }
    }

    /* Movers */
    if (topResp.ok) {
      const top = await topResp.json();
      if (Array.isArray(top) && top.length) {
        allMovers = top.filter(c => c.price_change_percentage_24h != null);
        renderMovers(activeMoverTab);
      } else {
        moversEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Sem dados disponíveis</div>`;
      }
    } else {
      moversEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Sem dados disponíveis</div>`;
    }
  } catch (err) {
    if (moversEl) moversEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Sem dados disponíveis</div>`;
  }
}

function renderMovers(tab) {
  if (!moversEl || !allMovers.length) return;
  const sorted = [...allMovers].sort((a, b) =>
    tab === 'gainers'
      ? b.price_change_percentage_24h - a.price_change_percentage_24h
      : a.price_change_percentage_24h - b.price_change_percentage_24h
  ).slice(0, 7);

  moversEl.innerHTML = sorted.map(c => {
    const ch = c.price_change_percentage_24h || 0;
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

/* Tab switch */
document.querySelectorAll('.mover-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mover-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMoverTab = btn.dataset.tab;
    renderMovers(activeMoverTab);
  });
});

/* Show home on empty input */
searchInput.addEventListener('input', () => {
  if (!searchInput.value.trim()) showHome();
});

/* Init */
showHome();
loadHomeData();
