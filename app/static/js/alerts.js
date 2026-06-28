/* alerts.js — Alerts management */

async function loadAlerts() {
  try {
    const r = await fetch('/api/alerts');
    if (!r.ok) return;
    const alerts = await r.json();
    renderAlerts(alerts);
    updateBadge(alerts.filter(a => a.active).length);
  } catch (e) { console.error('loadAlerts', e); }
}

function renderAlerts(alerts) {
  const tbody = document.getElementById('alerts-tbody');
  if (!tbody) return;

  if (!alerts.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:50px;color:var(--text-muted)">
      <div style="font-size:32px;margin-bottom:12px;opacity:.3"><i class="fa-solid fa-bell-slash"></i></div>
      <div style="font-size:14px;font-weight:600;margin-bottom:4px">Nenhum alerta criado</div>
      <div style="font-size:12px">Use o formulário ao lado para criar seu primeiro alerta</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = alerts.map(a => {
    const condLabel = a.condition === 'above' ? '<span class="condition-above">▲ Acima de</span>' : '<span class="condition-below">▼ Abaixo de</span>';
    const statusLabel = a.active
      ? '<span style="color:var(--accent-green)"><i class="fa-solid fa-circle" style="font-size:8px;margin-right:4px"></i>Ativo</span>'
      : '<span style="color:var(--text-muted)"><i class="fa-solid fa-check" style="font-size:10px;margin-right:4px"></i>Disparado</span>';
    const date = new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

    return `<tr>
      <td style="font-weight:600">${a.crypto_name}</td>
      <td>${condLabel}</td>
      <td style="font-family:var(--font-mono);font-weight:600">$${parseFloat(a.target_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td>${statusLabel}</td>
      <td style="color:var(--text-secondary);font-size:12px">${date}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteAlert(${a.id})"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function updateBadge(count) {
  ['alerts-badge','topbar-alerts-count'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    el.style.display = count > 0 ? '' : 'none';
  });
}

async function deleteAlert(id) {
  if (!confirm('Remover este alerta?')) return;
  try {
    await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
    loadAlerts();
    window.showToast && window.showToast('Removido', '', 'red', 3000);
  } catch { window.showToast && window.showToast('Erro', 'Não foi possível remover', 'red'); }
}

document.getElementById('create-alert-btn')?.addEventListener('click', async () => {
  const cryptoId   = document.getElementById('a-crypto-id')?.value.trim();
  const cryptoName = document.getElementById('a-crypto-name')?.value.trim();
  const condition  = document.getElementById('a-condition')?.value;
  const targetPrice = parseFloat(document.getElementById('a-target-price')?.value);

  if (!cryptoId || !cryptoName || !targetPrice) {
    window.showToast && window.showToast('Erro', 'Preencha todos os campos', 'red');
    return;
  }

  try {
    const r = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crypto_id: cryptoId, crypto_name: cryptoName, condition, target_price: targetPrice }),
    });
    const d = await r.json();
    if (d.error) { window.showToast && window.showToast('Erro', d.error, 'red'); return; }
    window.showToast && window.showToast('Alerta criado!', `Você será notificado sobre ${cryptoName}`, 'green');
    // Clear form
    ['a-crypto-id','a-crypto-name','a-target-price'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    loadAlerts();
  } catch { window.showToast && window.showToast('Erro', 'Falha ao criar alerta', 'red'); }
});

// Listen for triggered alerts via socket
if (typeof socket !== 'undefined') {
  socket.on('alert_triggered', () => loadAlerts());
}

document.addEventListener('DOMContentLoaded', loadAlerts);
