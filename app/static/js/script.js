/* script.js — Global: sidebar, ticker tape, search autocomplete, toasts, alerts badge */

const socket = io();

/* ── Sidebar toggle ──────────────────────────────────────── */
const sidebar       = document.getElementById('sidebar');
const mainContent   = document.getElementById('main-content');
const sidebarToggle = document.getElementById('sidebar-toggle');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');

function applySidebarCollapsed(collapsed) {
  sidebar && sidebar.classList.toggle('collapsed', collapsed);
  mainContent && mainContent.classList.toggle('sidebar-collapsed', collapsed);
}

if (sidebarToggle) {
  const saved = localStorage.getItem('ct-sidebar-collapsed') === '1';
  applySidebarCollapsed(saved);
  sidebarToggle.addEventListener('click', () => {
    const now = sidebar.classList.contains('collapsed');
    applySidebarCollapsed(!now);
    localStorage.setItem('ct-sidebar-collapsed', !now ? '1' : '0');
  });
}

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => {
    sidebar && sidebar.classList.toggle('mobile-open');
    sidebarOverlay && sidebarOverlay.classList.toggle('open');
  });
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener('click', () => {
    sidebar && sidebar.classList.remove('mobile-open');
    sidebarOverlay.classList.remove('open');
  });
}

/* ── Toast system ────────────────────────────────────────── */
function showToast(title, msg, type = 'blue', duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { green: 'fa-circle-check', red: 'fa-circle-exclamation', blue: 'fa-circle-info', yellow: 'fa-bell' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.blue} toast-icon"></i>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
    <button onclick="this.closest('.toast').remove()" style="color:var(--text-muted);font-size:14px;padding:2px 6px;background:none;border:none;cursor:pointer">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
window.showToast = showToast;

/* ── Ticker tape ─────────────────────────────────────────── */
function buildTicker(data) {
  const track = document.getElementById('ticker-track');
  if (!track || !data || !data.length) return;

  const fmt = (n) => n >= 1000
    ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '$' + (n < 1 ? n.toFixed(6) : n.toFixed(2));

  const items = data.map(c => {
    const chg = c.change || 0;
    const cls = chg >= 0 ? 'ticker-change-up' : 'ticker-change-down';
    const arrow = chg >= 0 ? '▲' : '▼';
    return `<span class="ticker-item">
      <span class="ticker-symbol">${c.symbol}</span>
      <span class="ticker-price">${fmt(c.price)}</span>
      <span class="${cls}">${arrow} ${Math.abs(chg).toFixed(2)}%</span>
    </span><span class="ticker-dot"></span>`;
  }).join('');

  track.innerHTML = items + items;
}
socket.on('ticker_update', buildTicker);

async function loadTickerNow() {
  try {
    const r = await fetch('/get-top-cryptos?limit=10');
    if (!r.ok) return;
    const data = await r.json();
    if (!Array.isArray(data)) return;
    buildTicker(data.map(c => ({
      symbol: (c.symbol || '').toUpperCase(),
      price:  c.current_price || 0,
      change: Math.round((c.price_change_percentage_24h || 0) * 100) / 100,
    })));
  } catch { /* silently ignore — ticker is non-critical */ }
}

document.addEventListener('DOMContentLoaded', loadTickerNow);

/* ── Alert badge & real-time alert toasts ────────────────── */
socket.on('alert_triggered', (data) => {
  const condition = data.condition === 'above' ? 'acima de' : 'abaixo de';
  showToast(
    `Alerta: ${data.crypto_name}`,
    `Preço $${(data.current_price || 0).toLocaleString()} — ${condition} $${(data.target_price || 0).toLocaleString()}`,
    'yellow',
    8000
  );
});

/* ── Global search autocomplete ─────────────────────────── */
const globalSearch   = document.getElementById('global-search');
const searchDropdown = document.getElementById('search-dropdown');
let searchTimer;
let searchAbort = null;

if (globalSearch && searchDropdown) {
  globalSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = globalSearch.value.trim();
    if (q.length < 2) { searchDropdown.classList.remove('open'); return; }

    searchTimer = setTimeout(async () => {
      try {
        if (searchAbort) searchAbort.abort();
        searchAbort = new AbortController();

        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: searchAbort.signal });
        if (!r.ok) { searchDropdown.classList.remove('open'); return; }
        const results = await r.json();

        if (!results.length) {
          searchDropdown.innerHTML = `
            <div style="padding:14px 16px;font-size:12px;color:var(--text-muted);text-align:center">
              Nenhum resultado para "${q}"
            </div>`;
          searchDropdown.classList.add('open');
          return;
        }

        searchDropdown.innerHTML = results.slice(0, 7).map(c => `
          <div class="search-result-item" onclick="window.location='/coin/${c.id}'" tabindex="0"
               onkeydown="if(event.key==='Enter')window.location='/coin/${c.id}'">
            ${c.thumb
              ? `<img src="${c.thumb}" alt="${c.name}" onerror="this.style.display='none'">`
              : `<div style="width:22px;height:22px;border-radius:50%;background:var(--bg-hover);flex-shrink:0"></div>`}
            <div style="flex:1;min-width:0">
              <div class="search-result-name">${c.name}</div>
              <div class="search-result-symbol">${c.symbol}</div>
            </div>
            ${c.rank ? `<div style="font-size:11px;color:var(--text-muted)">#${c.rank}</div>` : ''}
          </div>`).join('');

        searchDropdown.classList.add('open');
      } catch (e) {
        if (e.name !== 'AbortError') searchDropdown.classList.remove('open');
      }
    }, 280);
  });

  globalSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchDropdown.classList.remove('open'); globalSearch.blur(); }
    if (e.key === 'Enter') {
      const first = searchDropdown.querySelector('.search-result-item');
      if (first) first.click();
    }
  });

  document.addEventListener('click', (e) => {
    if (!globalSearch.contains(e.target) && !searchDropdown.contains(e.target)) {
      searchDropdown.classList.remove('open');
    }
  });
}

/* ── Number formatter helpers (global) ───────────────────── */
function fmtUSD(n, digits = 2) {
  if (!n && n !== 0) return '—';
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3)  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: digits });
  return '$' + n.toFixed(n < 0.01 ? 6 : digits);
}

function fmtPct(n) {
  if (n === null || n === undefined) return '<span style="color:var(--text-muted)">—</span>';
  const cls   = n >= 0 ? 'change-up' : 'change-down';
  const arrow = n >= 0 ? '▲' : '▼';
  return `<span class="${cls}">${arrow} ${Math.abs(n).toFixed(2)}%</span>`;
}

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
  return n.toLocaleString();
}

window.fmtUSD = fmtUSD;
window.fmtPct = fmtPct;
window.fmtNum = fmtNum;

/* ── Sparkline SVG helper ────────────────────────────────── */
function sparklineSVG(prices, positive) {
  if (!prices || prices.length < 2) return '';
  const w = 80, h = 32, pad = 2;
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  const color = positive ? 'var(--accent-green)' : 'var(--accent-red)';
  return `<svg class="sparkline-svg" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
window.sparklineSVG = sparklineSVG;
