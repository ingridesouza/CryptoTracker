/* coin.js — Asset detail page */

let priceChart = null;

async function loadCoinDetail() {
  if (!CRYPTO_ID) return;
  try {
    const r = await fetch(`/api/coin/${CRYPTO_ID}`);
    if (!r.ok) throw new Error('Not found');
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    renderCoin(d);
    loadHistory(7);
  } catch (e) {
    document.getElementById('coin-loading').innerHTML = `<p style="color:var(--accent-red)">Erro: ${e.message}</p>`;
  }
}

function renderCoin(d) {
  document.getElementById('coin-loading').style.display = 'none';
  document.getElementById('coin-content').style.display = '';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setHTML = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

  const img = document.getElementById('coin-img');
  if (img) img.src = d.image?.large || d.image?.thumb || '';
  set('coin-name', d.name);
  set('coin-symbol', d.symbol?.toUpperCase());
  set('coin-rank', d.market_cap_rank ? `#${d.market_cap_rank}` : '');

  const price = d.market_data?.current_price?.usd || 0;
  const ch24h = d.market_data?.price_change_percentage_24h || 0;

  set('coin-price', price >= 1
    ? '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '$' + price.toFixed(8));

  const pEl = document.getElementById('coin-price-change');
  if (pEl) {
    pEl.className = 'coin-price-change ' + (ch24h >= 0 ? 'change-up' : 'change-down');
    pEl.textContent = `${ch24h >= 0 ? '▲' : '▼'} ${Math.abs(ch24h).toFixed(2)}%`;
  }

  const md = d.market_data || {};
  set('s-mcap',       window.fmtUSD ? window.fmtUSD(md.market_cap?.usd) : '—');
  set('s-vol',        window.fmtUSD ? window.fmtUSD(md.total_volume?.usd) : '—');
  set('s-ath',        window.fmtUSD ? window.fmtUSD(md.ath?.usd) : '—');
  set('s-atl',        window.fmtUSD ? window.fmtUSD(md.atl?.usd) : '—');
  set('s-supply',     window.fmtNum ? window.fmtNum(md.circulating_supply) : '—');
  set('s-max-supply', md.max_supply ? (window.fmtNum ? window.fmtNum(md.max_supply) : md.max_supply) : '∞');

  // Description
  const desc = d.description?.en;
  if (desc) {
    const cleanDesc = desc.replace(/<[^>]*>/g, '').substring(0, 500) + '...';
    const card = document.getElementById('coin-desc-card');
    const p    = document.getElementById('coin-description');
    if (card) card.style.display = '';
    if (p) p.textContent = cleanDesc;
  }

  // Quick alert button
  document.getElementById('quick-price').placeholder = price.toFixed(2);
}

async function loadHistory(days) {
  // Update period buttons
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.days) === days);
  });

  try {
    const r = await fetch(`/api/history/${CRYPTO_ID}?days=${days}`);
    const d = await r.json();
    if (d.error || !d.prices?.length) return;

    const labels = d.prices.map(p => {
      const dt = new Date(p[0]);
      return days <= 1 ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                       : dt.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
    });
    const prices = d.prices.map(p => p[1]);
    const isUp   = prices[prices.length - 1] >= prices[0];
    const color  = isUp ? '#3fb950' : '#f85149';

    const canvas = document.getElementById('price-chart');
    if (!canvas) return;
    if (priceChart) priceChart.destroy();

    priceChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: prices,
          borderColor: color,
          backgroundColor: isUp ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1c2128',
            borderColor: '#30363d',
            borderWidth: 1,
            titleColor: '#8b949e',
            bodyColor: '#e6edf3',
            callbacks: {
              label: ctx => '$' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(48,54,61,0.5)' }, ticks: { color: '#8b949e', maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(48,54,61,0.5)' }, ticks: { color: '#8b949e', callback: v => '$' + v.toLocaleString() } }
        }
      }
    });
  } catch (e) { console.error('loadHistory', e); }
}

/* ── Period buttons ──────────────────────────────────────── */
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => loadHistory(parseInt(btn.dataset.days)));
});

/* ── Quick alert ─────────────────────────────────────────── */
document.getElementById('quick-alert-btn')?.addEventListener('click', async () => {
  const condition   = document.getElementById('quick-condition')?.value;
  const targetPrice = parseFloat(document.getElementById('quick-price')?.value);
  if (!targetPrice) { window.showToast && window.showToast('Erro', 'Digite um preço alvo', 'red'); return; }

  try {
    const r = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crypto_id: CRYPTO_ID, crypto_name: CRYPTO_ID, condition, target_price: targetPrice }),
    });
    const d = await r.json();
    if (d.error) { window.showToast && window.showToast('Erro', d.error, 'red'); return; }
    window.showToast && window.showToast('Alerta criado!', `Você será notificado quando o preço ${condition === 'above' ? 'subir acima' : 'cair abaixo'} de $${targetPrice}`, 'green');
  } catch { window.showToast && window.showToast('Erro', 'Falha ao criar alerta', 'red'); }
});

/* ── Portfolio modal ─────────────────────────────────────── */
document.getElementById('add-to-portfolio-btn')?.addEventListener('click', () => {
  document.getElementById('portfolio-modal').style.display = 'flex';
});
document.getElementById('close-portfolio-modal')?.addEventListener('click', () => {
  document.getElementById('portfolio-modal').style.display = 'none';
});
document.getElementById('cancel-portfolio-modal')?.addEventListener('click', () => {
  document.getElementById('portfolio-modal').style.display = 'none';
});
document.getElementById('save-portfolio')?.addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('pm-amount')?.value);
  const price  = parseFloat(document.getElementById('pm-price')?.value);
  const date   = document.getElementById('pm-date')?.value || null;
  const name   = document.getElementById('coin-name')?.textContent || CRYPTO_ID;

  if (!amount || !price) { window.showToast && window.showToast('Erro', 'Preencha quantidade e preço', 'red'); return; }

  try {
    const r = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crypto_id: CRYPTO_ID, crypto_name: name, amount, purchase_price: price, purchase_date: date }),
    });
    const d = await r.json();
    if (d.error) { window.showToast && window.showToast('Erro', d.error, 'red'); return; }
    document.getElementById('portfolio-modal').style.display = 'none';
    window.showToast && window.showToast('Adicionado!', `${name} adicionado ao portfolio`, 'green');
  } catch { window.showToast && window.showToast('Erro', 'Falha ao salvar', 'red'); }
});

document.addEventListener('DOMContentLoaded', loadCoinDetail);
