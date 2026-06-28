/* search.js — Search page with multi-result support */

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
      <button onclick="history.back()" class="btn btn-ghost btn-sm" style="margin-bottom:16px">
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
  if (!q) return;

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
