/* dashboard.js — Analytics dashboard with 4 charts */

let charts = {};
const PALETTE = ['#58a6ff','#3fb950','#f85149','#d29922','#bc8cff','#f0883e','#39d353','#f78166','#a5d6ff','#7ee787'];

Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = 'rgba(48,54,61,0.6)';

function destroyCharts() {
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};
}

async function loadDashboard() {
  const currency = document.getElementById('dash-currency')?.value || 'usd';
  const limit    = document.getElementById('dash-limit')?.value || 20;
  const status   = document.getElementById('dash-status');
  if (status) status.textContent = 'Carregando...';

  try {
    const r = await fetch(`/get-top-cryptos?limit=${limit}&currency=${currency}`);
    if (!r.ok) throw new Error('Falha na API');
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error('Dados inválidos');

    destroyCharts();
    renderMcapChart(data);
    renderPricesChart(data, currency);
    renderChangesChart(data);
    renderScatterChart(data);

    if (status) status.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (e) {
    if (status) status.textContent = 'Erro ao carregar dados';
    console.error('loadDashboard', e);
  }
}

function renderMcapChart(data) {
  const ctx = document.getElementById('chart-mcap');
  if (!ctx) return;
  const top10 = data.slice(0, 10);
  charts.mcap = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: top10.map(c => c.name),
      datasets: [{
        data: top10.map(c => c.market_cap || 0),
        backgroundColor: PALETTE,
        borderWidth: 2,
        borderColor: '#1c2128',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${window.fmtUSD ? window.fmtUSD(ctx.raw) : '$'+ctx.raw}` } }
      }
    }
  });
}

function renderPricesChart(data, currency) {
  const ctx = document.getElementById('chart-prices');
  if (!ctx) return;
  const top15 = data.slice(0, 15);
  const sym = { usd: '$', brl: 'R$', eur: '€' }[currency] || '$';
  charts.prices = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top15.map(c => c.symbol?.toUpperCase()),
      datasets: [{
        label: `Preço (${currency.toUpperCase()})`,
        data: top15.map(c => c.current_price || 0),
        backgroundColor: top15.map((_, i) => PALETTE[i % PALETTE.length] + 'cc'),
        borderColor: top15.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => sym + ctx.raw.toLocaleString() } } },
      scales: {
        y: { ticks: { callback: v => sym + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } }
      }
    }
  });
}

function renderChangesChart(data) {
  const ctx = document.getElementById('chart-changes');
  if (!ctx) return;
  charts.changes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.slice(0, 20).map(c => c.symbol?.toUpperCase()),
      datasets: [{
        label: 'Variação 24h (%)',
        data: data.slice(0, 20).map(c => c.price_change_percentage_24h || 0),
        backgroundColor: data.slice(0, 20).map(c => (c.price_change_percentage_24h || 0) >= 0 ? 'rgba(63,185,80,0.7)' : 'rgba(248,81,73,0.7)'),
        borderColor:     data.slice(0, 20).map(c => (c.price_change_percentage_24h || 0) >= 0 ? '#3fb950' : '#f85149'),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(2) + '%' } } },
      scales: { y: { ticks: { callback: v => v.toFixed(1) + '%' } } }
    }
  });
}

function renderScatterChart(data) {
  const ctx = document.getElementById('chart-scatter');
  if (!ctx) return;
  const pts = data.filter(c => c.market_cap && c.total_volume).map((c, i) => ({
    x: c.market_cap / 1e9,
    y: c.total_volume / 1e9,
    label: c.name,
    color: PALETTE[i % PALETTE.length],
  }));

  charts.scatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Volume vs Market Cap',
        data: pts,
        backgroundColor: pts.map(p => p.color + '99'),
        borderColor: pts.map(p => p.color),
        borderWidth: 1,
        pointRadius: 7,
        pointHoverRadius: 9,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.raw.label}: Cap $${ctx.raw.x.toFixed(1)}B · Vol $${ctx.raw.y.toFixed(1)}B` } }
      },
      scales: {
        x: { title: { display: true, text: 'Market Cap (B)', color: '#8b949e' }, ticks: { callback: v => '$' + v + 'B' } },
        y: { title: { display: true, text: 'Volume 24h (B)', color: '#8b949e' }, ticks: { callback: v => '$' + v + 'B' } }
      }
    }
  });
}

document.getElementById('dash-apply')?.addEventListener('click', loadDashboard);

document.addEventListener('DOMContentLoaded', loadDashboard);
