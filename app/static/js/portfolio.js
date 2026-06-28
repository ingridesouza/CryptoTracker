/* portfolio.js — Portfolio tracker */

const CHART_COLORS = ['#58a6ff','#3fb950','#f85149','#d29922','#bc8cff','#f0883e','#39d353','#f78166','#6e7681','#a5d6ff'];
let allocChart = null;

async function loadPortfolio() {
  try {
    const r = await fetch('/api/portfolio');
    if (!r.ok) { showEmpty(); return; }
    const d = await r.json();
    renderSummary(d);
    renderHoldings(d.holdings || []);
    renderAllocation(d.holdings || []);
  } catch (e) {
    console.error('loadPortfolio', e);
    showEmpty();
  }
}

function renderSummary(d) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setHTML = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

  set('p-total-value', window.fmtUSD ? window.fmtUSD(d.total_value) : '$' + (d.total_value || 0).toFixed(2));
  set('p-total-cost',  'Investido: ' + (window.fmtUSD ? window.fmtUSD(d.total_cost) : '$' + (d.total_cost || 0).toFixed(2)));
  set('p-count', (d.holdings || []).length);

  const pnl = d.total_pnl || 0;
  const pnlPct = d.total_pnl_pct || 0;
  const pnlSign = pnl >= 0 ? '+' : '';
  setHTML('p-total-pnl', `<span class="${pnl >= 0 ? 'change-up' : 'change-down'}">${pnlSign}${window.fmtUSD ? window.fmtUSD(pnl) : '$' + pnl.toFixed(2)}</span>`);
  setHTML('p-total-pnl-pct', `<span class="${pnl >= 0 ? 'change-up' : 'change-down'}">${pnlSign}${pnlPct.toFixed(2)}%</span>`);

  // Best performer
  const holdings = d.holdings || [];
  if (holdings.length) {
    const best = holdings.reduce((a, b) => a.pnl_pct > b.pnl_pct ? a : b);
    set('p-best', best.crypto_name);
    const el = document.getElementById('p-best-sub');
    if (el) el.innerHTML = `<span class="${best.pnl_pct >= 0 ? 'change-up' : 'change-down'}">${best.pnl_pct >= 0 ? '+' : ''}${best.pnl_pct.toFixed(2)}%</span>`;
  }
}

function renderHoldings(holdings) {
  const tbody = document.getElementById('holdings-tbody');
  if (!tbody) return;

  if (!holdings.length) {
    tbody.innerHTML = `<tr><td colspan="9">
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fa-solid fa-briefcase"></i></div>
        <div class="empty-state-title">Portfolio vazio</div>
        <div class="empty-state-sub">Adicione sua primeira posição clicando em "Adicionar"</div>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = holdings.map(h => {
    const pnlCls = h.pnl >= 0 ? 'change-up' : 'change-down';
    const pnlSign = h.pnl >= 0 ? '+' : '';
    return `<tr>
      <td>
        <div style="font-weight:700;font-size:13px">${h.crypto_name}</div>
        <div style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono)">${h.crypto_id}</div>
      </td>
      <td style="font-family:var(--font-mono)">${h.amount}</td>
      <td style="font-family:var(--font-mono)">${window.fmtUSD ? window.fmtUSD(h.purchase_price) : '$'+h.purchase_price}</td>
      <td style="font-family:var(--font-mono);font-weight:600">${window.fmtUSD ? window.fmtUSD(h.current_price) : '$'+h.current_price}</td>
      <td style="font-family:var(--font-mono)">${window.fmtUSD ? window.fmtUSD(h.cost) : '$'+h.cost}</td>
      <td style="font-family:var(--font-mono);font-weight:600">${window.fmtUSD ? window.fmtUSD(h.value) : '$'+h.value}</td>
      <td style="font-family:var(--font-mono)"><span class="${pnlCls}">${pnlSign}${window.fmtUSD ? window.fmtUSD(h.pnl) : '$'+h.pnl.toFixed(2)}</span></td>
      <td style="font-family:var(--font-mono)"><span class="${pnlCls}">${pnlSign}${h.pnl_pct.toFixed(2)}%</span></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="removeHolding(${h.id})">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function renderAllocation(holdings) {
  const canvas = document.getElementById('alloc-chart');
  const legend = document.getElementById('alloc-legend');
  if (!canvas) return;

  if (!holdings.length) {
    canvas.parentElement.style.display = 'none';
    return;
  }

  const total = holdings.reduce((s, h) => s + h.value, 0);
  const labels = holdings.map(h => h.crypto_name);
  const values = holdings.map(h => h.value);
  const pcts   = holdings.map(h => ((h.value / total) * 100).toFixed(1));

  if (allocChart) allocChart.destroy();
  allocChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: CHART_COLORS.slice(0, holdings.length), borderWidth: 2, borderColor: '#1c2128' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      cutout: '65%',
    }
  });

  if (legend) {
    legend.innerHTML = holdings.map((h, i) => `
      <div class="alloc-legend-item">
        <span class="alloc-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
        <span class="alloc-name">${h.crypto_name}</span>
        <span class="alloc-pct">${pcts[i]}%</span>
      </div>`).join('');
  }
}

function showEmpty() {
  const tbody = document.getElementById('holdings-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">Erro ao carregar portfolio</td></tr>`;
}

async function removeHolding(id) {
  if (!confirm('Remover esta posição?')) return;
  try {
    await fetch(`/api/portfolio/${id}`, { method: 'DELETE' });
    loadPortfolio();
    window.showToast && window.showToast('Removido', '', 'red', 3000);
  } catch { window.showToast && window.showToast('Erro', 'Não foi possível remover', 'red'); }
}

/* ── Modal ───────────────────────────────────────────────── */
document.getElementById('add-holding-btn')?.addEventListener('click', () => {
  document.getElementById('add-modal').style.display = 'flex';
});
document.getElementById('close-modal')?.addEventListener('click', () => {
  document.getElementById('add-modal').style.display = 'none';
});
document.getElementById('cancel-modal')?.addEventListener('click', () => {
  document.getElementById('add-modal').style.display = 'none';
});
document.getElementById('save-holding')?.addEventListener('click', async () => {
  const body = {
    crypto_id:      document.getElementById('h-crypto-id')?.value.trim(),
    crypto_name:    document.getElementById('h-crypto-name')?.value.trim(),
    amount:         document.getElementById('h-amount')?.value,
    purchase_price: document.getElementById('h-purchase-price')?.value,
    purchase_date:  document.getElementById('h-date')?.value || null,
  };
  if (!body.crypto_id || !body.crypto_name || !body.amount || !body.purchase_price) {
    window.showToast && window.showToast('Erro', 'Preencha todos os campos obrigatórios', 'red');
    return;
  }
  try {
    const r = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.error) { window.showToast && window.showToast('Erro', d.error, 'red'); return; }
    document.getElementById('add-modal').style.display = 'none';
    loadPortfolio();
    window.showToast && window.showToast('Adicionado!', `${body.crypto_name} adicionado ao portfolio`, 'green');
  } catch { window.showToast && window.showToast('Erro', 'Não foi possível salvar', 'red'); }
});

document.addEventListener('DOMContentLoaded', loadPortfolio);
