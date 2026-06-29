/* portfolio.js — Fase 1: Transações + P&L em BRL */

let usdBrl = 5.70;
let portfolioData = null;
let currency = localStorage.getItem('ct-currency') || 'brl';
let selectedTxType = 'buy';
let selectedCoin = null;
let coinSearchTimer = null;

// ── Formatação ────────────────────────────────────────────────

function fmtBRL(val) {
  return 'R$ ' + (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtUSD(val) {
  return '$' + (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtQty(val) {
  if (!val) return '0';
  if (val < 0.001) return val.toFixed(8);
  if (val < 1) return val.toFixed(6);
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}
function fmtPrice(val_brl) {
  return currency === 'brl' ? fmtBRL(val_brl) : fmtUSD(val_brl / usdBrl);
}

// ── Carregar dados ────────────────────────────────────────────

async function loadAll() {
  try {
    const [summaryRes, txRes] = await Promise.all([
      fetch('/api/portfolio/summary'),
      fetch('/api/transactions'),
    ]);
    if (!summaryRes.ok || !txRes.ok) throw new Error('Erro ao carregar dados');
    portfolioData = await summaryRes.json();
    const txs = await txRes.json();
    usdBrl = portfolioData.usd_brl || 5.70;
    renderSummary(portfolioData.totals);
    renderHoldings(portfolioData.holdings);
    renderAlloc(portfolioData.holdings);
    renderTransactions(txs);
    syncCurrencyToggle();
  } catch (e) {
    console.error('loadAll:', e);
  }
}

// ── Summary cards ─────────────────────────────────────────────

function renderSummary(totals) {
  const isBRL = currency === 'brl';
  document.getElementById('p-total-value').textContent  = isBRL ? fmtBRL(totals.value_brl) : fmtUSD(totals.value_usd);
  document.getElementById('p-total-value-2').textContent = isBRL ? `≈ ${fmtUSD(totals.value_usd)}` : `≈ ${fmtBRL(totals.value_brl)}`;
  document.getElementById('p-invested').textContent      = isBRL ? fmtBRL(totals.invested_brl) : fmtUSD(totals.invested_brl / usdBrl);
  document.getElementById('p-rate').textContent          = `USD/BRL: R$${usdBrl.toFixed(2)}`;

  const pnlEl    = document.getElementById('p-pnl');
  const pnlPctEl = document.getElementById('p-pnl-pct');
  const pnl      = isBRL ? totals.pnl_brl : totals.pnl_brl / usdBrl;
  pnlEl.textContent  = (pnl >= 0 ? '+' : '') + (isBRL ? fmtBRL(pnl) : fmtUSD(pnl));
  pnlEl.style.color  = pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  const pct = totals.pnl_pct || 0;
  pnlPctEl.textContent = (pct >= 0 ? '▲ +' : '▼ ') + Math.abs(pct).toFixed(2) + '%';
  pnlPctEl.style.color  = pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

  document.getElementById('p-count').textContent = portfolioData.holdings.length;
}

// ── Holdings table ────────────────────────────────────────────

function renderHoldings(holdings) {
  const tbody = document.getElementById('holdings-tbody');
  if (!holdings.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">
      Nenhuma posição. Adicione sua primeira transação.
    </td></tr>`;
    return;
  }
  tbody.innerHTML = holdings.map(h => {
    const cls   = h.pnl_brl >= 0 ? 'change-up' : 'change-down';
    const arrow = h.pnl_brl >= 0 ? '▲' : '▼';
    return `<tr>
      <td>
        <div style="font-weight:600">${h.crypto_name}</div>
        <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${h.crypto_symbol}</div>
      </td>
      <td style="font-family:var(--font-mono)">${fmtQty(h.quantity)}</td>
      <td style="font-family:var(--font-mono)">${fmtPrice(h.avg_cost_brl)}</td>
      <td style="font-family:var(--font-mono)">${fmtPrice(h.price_brl)}</td>
      <td style="font-family:var(--font-mono)">${fmtPrice(h.total_invested_brl)}</td>
      <td style="font-family:var(--font-mono)">${fmtPrice(h.current_value_brl)}</td>
      <td class="${cls}" style="font-family:var(--font-mono);font-weight:600">${arrow} ${fmtPrice(h.pnl_brl)}</td>
      <td class="${cls}" style="font-family:var(--font-mono);font-weight:600">${arrow} ${Math.abs(h.pnl_pct).toFixed(2)}%</td>
    </tr>`;
  }).join('');
}

// ── Allocation chart ──────────────────────────────────────────

function renderAlloc(holdings) {
  const canvas = document.getElementById('alloc-chart');
  const legend = document.getElementById('alloc-legend');
  if (!canvas || !holdings.length) {
    if (legend) legend.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px 0">Sem dados</div>`;
    return;
  }
  const total  = holdings.reduce((s, h) => s + h.current_value_brl, 0);
  const COLORS = ['#58a6ff','#3fb950','#bc8cff','#d29922','#f85149','#79c0ff','#56d364','#e3b341'];
  if (window._allocChart) window._allocChart.destroy();
  window._allocChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: holdings.map(h => h.crypto_symbol),
      datasets: [{ data: holdings.map(h => h.current_value_brl), backgroundColor: COLORS.slice(0, holdings.length), borderWidth: 0, hoverOffset: 4 }],
    },
    options: {
      cutout: '70%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${((ctx.raw / total) * 100).toFixed(1)}%` } } },
    },
  });
  legend.innerHTML = holdings.map((h, i) => `
    <div class="alloc-legend-item">
      <span class="alloc-dot" style="background:${COLORS[i % COLORS.length]}"></span>
      <span class="alloc-name">${h.crypto_name}</span>
      <span class="alloc-pct">${((h.current_value_brl / total) * 100).toFixed(1)}%</span>
    </div>`).join('');
}

// ── Transactions list ─────────────────────────────────────────

function renderTransactions(txs) {
  const list  = document.getElementById('tx-list');
  const count = document.getElementById('tx-count');
  if (count) count.textContent = `${txs.length} transaç${txs.length === 1 ? 'ão' : 'ões'}`;
  if (!txs.length) {
    list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Nenhuma transação registrada ainda.</div>`;
    return;
  }
  list.innerHTML = txs.map(tx => {
    const isBuy   = tx.type === 'buy';
    const total   = tx.quantity * tx.price_brl;
    const priceFmt = fmtPrice(tx.price_brl);
    return `<div class="tx-row">
      <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${tx.date}</span>
      <span>
        <div style="font-weight:600;font-size:13px">${tx.crypto_name}</div>
        <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${tx.crypto_symbol}</div>
      </span>
      <span><span class="tx-badge ${isBuy ? 'buy' : 'sell'}">${isBuy ? '▲ Compra' : '▼ Venda'}</span></span>
      <span style="font-family:var(--font-mono);font-size:12px">${fmtQty(tx.quantity)}</span>
      <span style="font-family:var(--font-mono);font-size:12px">${priceFmt}</span>
      <button class="tx-del" data-id="${tx.id}" title="Remover">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>`;
  }).join('');
  list.querySelectorAll('.tx-del').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(parseInt(btn.dataset.id)));
  });
}

async function deleteTransaction(id) {
  if (!confirm('Remover esta transação?')) return;
  await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
  loadAll();
}

// ── Modal ─────────────────────────────────────────────────────

const modal     = document.getElementById('tx-modal');
const addBtn    = document.getElementById('add-tx-btn');
const closeBtn  = document.getElementById('close-tx-modal');
const cancelBtn = document.getElementById('cancel-tx-modal');
const saveBtn   = document.getElementById('save-tx');

function openModal() {
  selectedCoin = null;
  const coinInput = document.getElementById('coin-search-input');
  coinInput.value = '';
  coinInput.style.display = '';
  document.getElementById('selected-coin-display').style.display = 'none';
  document.getElementById('coin-dropdown').classList.remove('open');
  document.getElementById('tx-qty').value        = '';
  document.getElementById('tx-price-brl').value  = '';
  document.getElementById('tx-notes').value      = '';
  document.getElementById('tx-date').value       = new Date().toISOString().split('T')[0];
  document.getElementById('price-hint-usd').textContent = '≈ USD —';
  setTxType('buy');
  modal.style.display = 'flex';
}
function closeModal() { modal.style.display = 'none'; }

addBtn?.addEventListener('click', openModal);
closeBtn?.addEventListener('click', closeModal);
cancelBtn?.addEventListener('click', closeModal);
modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });

function setTxType(type) {
  selectedTxType = type;
  document.getElementById('type-buy').className  = 'type-btn' + (type === 'buy'  ? ' active-buy'  : '');
  document.getElementById('type-sell').className = 'type-btn' + (type === 'sell' ? ' active-sell' : '');
}
document.getElementById('type-buy')?.addEventListener('click',  () => setTxType('buy'));
document.getElementById('type-sell')?.addEventListener('click', () => setTxType('sell'));

// Coin autocomplete
const coinInput    = document.getElementById('coin-search-input');
const coinDropdown = document.getElementById('coin-dropdown');

coinInput?.addEventListener('input', () => {
  clearTimeout(coinSearchTimer);
  const q = coinInput.value.trim();
  if (q.length < 2) { coinDropdown.classList.remove('open'); return; }
  coinSearchTimer = setTimeout(async () => {
    try {
      const results = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json());
      if (!results.length) { coinDropdown.classList.remove('open'); return; }
      coinDropdown.innerHTML = results.slice(0, 7).map(c => `
        <div class="coin-option" data-id="${c.id}" data-name="${c.name}" data-symbol="${c.symbol}" data-thumb="${c.thumb || ''}">
          ${c.thumb ? `<img src="${c.thumb}" onerror="this.style.display='none'">` : ''}
          <div style="flex:1">
            <div style="font-weight:600">${c.name}</div>
            <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${c.symbol}</div>
          </div>
          ${c.rank ? `<span style="font-size:11px;color:var(--text-muted)">#${c.rank}</span>` : ''}
        </div>`).join('');
      coinDropdown.classList.add('open');
      coinDropdown.querySelectorAll('.coin-option').forEach(el => {
        el.addEventListener('click', () => selectCoin({ id: el.dataset.id, name: el.dataset.name, symbol: el.dataset.symbol, thumb: el.dataset.thumb }));
      });
    } catch {}
  }, 280);
});

function selectCoin(coin) {
  selectedCoin = coin;
  coinDropdown.classList.remove('open');
  coinInput.style.display = 'none';
  const disp = document.getElementById('selected-coin-display');
  disp.style.display = 'block';
  disp.innerHTML = `
    <div class="selected-coin" id="coin-reset-btn">
      ${coin.thumb ? `<img src="${coin.thumb}" onerror="this.style.display='none'">` : ''}
      <div style="flex:1">
        <span style="font-weight:600;font-size:13px">${coin.name}</span>
        <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);margin-left:6px">${coin.symbol}</span>
      </div>
      <i class="fa-solid fa-xmark" style="color:var(--text-muted);font-size:12px"></i>
    </div>`;
  document.getElementById('coin-reset-btn')?.addEventListener('click', () => {
    selectedCoin = null;
    coinInput.value = '';
    coinInput.style.display = '';
    disp.style.display = 'none';
    coinInput.focus();
  });
}

document.getElementById('tx-price-brl')?.addEventListener('input', e => {
  const brl = parseFloat(e.target.value) || 0;
  document.getElementById('price-hint-usd').textContent = brl > 0 ? `≈ ${fmtUSD(brl / usdBrl)}` : '≈ USD —';
});

document.addEventListener('click', e => {
  if (!coinInput?.contains(e.target) && !coinDropdown?.contains(e.target)) coinDropdown?.classList.remove('open');
});

saveBtn?.addEventListener('click', async () => {
  if (!selectedCoin) { alert('Selecione uma moeda.'); return; }
  const qty   = parseFloat(document.getElementById('tx-qty').value);
  const price = parseFloat(document.getElementById('tx-price-brl').value);
  const date  = document.getElementById('tx-date').value;
  if (!qty   || qty   <= 0) { alert('Quantidade inválida.'); return; }
  if (!price || price <= 0) { alert('Preço inválido.'); return; }
  if (!date)                { alert('Data obrigatória.'); return; }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  try {
    const r = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crypto_id: selectedCoin.id, crypto_name: selectedCoin.name,
        crypto_symbol: selectedCoin.symbol, type: selectedTxType,
        quantity: qty, price_brl: price, date,
        notes: document.getElementById('tx-notes').value,
      }),
    });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.error || 'Erro ao salvar');
    closeModal();
    loadAll();
  } catch (e) { alert(e.message); }
  finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar';
  }
});

// ── Currency toggle ───────────────────────────────────────────

function syncCurrencyToggle() {
  document.querySelectorAll('.cur-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.cur === currency);
  });
}

document.getElementById('currency-toggle')?.addEventListener('click', e => {
  const opt = e.target.closest('.cur-opt');
  if (!opt) return;
  currency = opt.dataset.cur;
  localStorage.setItem('ct-currency', currency);
  syncCurrencyToggle();
  if (portfolioData) {
    renderSummary(portfolioData.totals);
    renderHoldings(portfolioData.holdings);
  }
  fetch('/api/transactions').then(r => r.json()).then(renderTransactions);
});

// ── Init ──────────────────────────────────────────────────────
syncCurrencyToggle();
loadAll();
