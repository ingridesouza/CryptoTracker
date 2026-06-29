/* exchanges.js — Conexões com exchanges e importação CSV */

let selectedExchange = 'binance';
let csvFile = null;

const EX_DISPLAY = {
  binance:         'Binance',
  mercado_bitcoin: 'Mercado Bitcoin',
  csv:             'CSV Import',
};

const EX_HINTS = {
  binance: `Crie uma chave de API na Binance com permissão apenas de <strong>leitura (Read)</strong>.
    <strong>Nunca ative permissão de saque.</strong>
    Acesse: Perfil → Gerenciar API → Criar API → Restrição de IP recomendada.`,
  mercado_bitcoin: `Use o <strong>TAPI ID</strong> e <strong>TAPI Secret</strong> do Mercado Bitcoin.
    Acesse: Minha Conta → Acesso à API → Criar nova chave.
    Permissões necessárias: <em>consultar saldo</em> e <em>consultar negociações</em>.`,
};

// ── API helpers ───────────────────────────────────────────────

async function apiFetch(url, opts = {}) {
  const r = await fetch(url, opts);
  return r.json();
}

// ── Carregar e renderizar ─────────────────────────────────────

async function loadKeys() {
  const data = await apiFetch('/api/exchanges');
  const keys = data.keys || [];
  const total = data.total_imported ?? 0;
  document.getElementById('stat-connected').textContent = keys.length;
  document.getElementById('stat-imported').textContent  = total;
  renderCards(keys);
}

function renderCards(keys) {
  const grid = document.getElementById('exchange-grid');
  if (!keys.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--text-muted);font-size:13px;padding:8px 0">
      Nenhuma exchange conectada ainda. Use o botão acima ou importe via CSV.
    </div>`;
    return;
  }

  grid.innerHTML = keys.map(k => {
    const name  = EX_DISPLAY[k.exchange] || k.exchange;
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const syncText = k.last_sync_at
      ? `Sincronizado em ${new Date(k.last_sync_at + 'Z').toLocaleString('pt-BR')}`
      : 'Nunca sincronizado';
    return `<div class="exchange-card ${k.exchange}">
      <div class="ex-card-header">
        <div class="ex-logo ${k.exchange}">${initials}</div>
        <div>
          <div class="ex-card-name">${name}</div>
          <div class="ex-card-label">${k.label}</div>
        </div>
      </div>
      <div class="ex-key-preview">${k.api_key_masked}</div>
      <div class="ex-sync-time">${syncText}</div>
      <div class="ex-actions">
        <button class="btn btn-ghost btn-sm" onclick="testKey(${k.id}, this)">
          <i class="fa-solid fa-plug"></i> Testar
        </button>
        <button class="btn btn-primary btn-sm" onclick="syncKey(${k.id}, this)">
          <i class="fa-solid fa-rotate"></i> Sincronizar
        </button>
        <button class="btn btn-ghost btn-sm" style="color:var(--accent-red);margin-left:auto"
                onclick="deleteKey(${k.id})">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');
}

// ── Ações por exchange ────────────────────────────────────────

async function testKey(id, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  const data = await apiFetch(`/api/exchanges/${id}/test`, { method: 'POST' });
  btn.disabled = false;
  btn.innerHTML = orig;
  if (data.ok) {
    showToast('Conexão OK!', 'success');
  } else {
    showToast('Falha: ' + (data.error || 'Erro desconhecido'), 'error');
  }
}

async function syncKey(id, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando…';
  const data = await apiFetch(`/api/exchanges/${id}/sync`, { method: 'POST' });
  btn.disabled = false;
  btn.innerHTML = orig;
  if (data.ok) {
    const n = data.imported;
    showToast(
      n > 0 ? `${n} transaç${n === 1 ? 'ão importada' : 'ões importadas'}!` : 'Tudo atualizado — nada novo.',
      n > 0 ? 'success' : 'info'
    );
    loadKeys();
  } else {
    showToast('Erro: ' + (data.error || 'Falha ao sincronizar'), 'error');
  }
}

async function deleteKey(id) {
  if (!confirm('Remover esta conexão?\n\nAs transações já importadas serão mantidas no seu portfolio.')) return;
  await apiFetch(`/api/exchanges/${id}`, { method: 'DELETE' });
  showToast('Conexão removida.', 'info');
  loadKeys();
}

// ── Formulário de conexão ─────────────────────────────────────

function toggleConnect() {
  const section = document.getElementById('connect-section');
  const body    = document.getElementById('connect-body');
  const isOpen  = section.classList.toggle('open');
  body.style.display = isOpen ? 'block' : 'none';
  if (isOpen) {
    setExchange(selectedExchange);
    body.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function setExchange(name) {
  selectedExchange = name;
  document.querySelectorAll('.ex-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.ex === name);
  });
  const hint = document.getElementById('ex-hint-text');
  if (hint) hint.innerHTML = EX_HINTS[name] || '';

  const inpKey    = document.getElementById('inp-key');
  const inpSecret = document.getElementById('inp-secret');
  const lblKey    = document.getElementById('label-key');
  const lblSecret = document.getElementById('label-secret');

  if (name === 'binance') {
    inpKey.placeholder    = 'API Key';
    inpSecret.placeholder = 'Secret Key';
    lblKey.textContent    = 'API Key';
    lblSecret.textContent = 'Secret Key';
  } else {
    inpKey.placeholder    = 'TAPI ID';
    inpSecret.placeholder = 'TAPI Secret';
    lblKey.textContent    = 'TAPI ID';
    lblSecret.textContent = 'TAPI Secret';
  }
}

async function submitConnect(e) {
  e.preventDefault();
  const api_key    = document.getElementById('inp-key').value.trim();
  const api_secret = document.getElementById('inp-secret').value.trim();
  const label      = document.getElementById('inp-label').value.trim();
  if (!api_key) return;

  const btn = document.getElementById('btn-connect');
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando…';

  const data = await apiFetch('/api/exchanges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exchange: selectedExchange, api_key, api_secret, label }),
  });

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-plug"></i> Conectar';

  if (data.ok) {
    showToast('Exchange conectada com sucesso!', 'success');
    document.getElementById('connect-form').reset();
    document.getElementById('connect-section').classList.remove('open');
    document.getElementById('connect-body').style.display = 'none';
    loadKeys();
  } else {
    showToast('Erro: ' + (data.error || 'Falha ao salvar'), 'error');
  }
}

// ── CSV ───────────────────────────────────────────────────────

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.add('drag-over');
}
function handleDragLeave() {
  document.getElementById('drop-zone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) setCSVFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) setCSVFile(file);
}
function setCSVFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showToast('Somente arquivos .csv são aceitos.', 'error');
    return;
  }
  csvFile = file;
  document.getElementById('csv-file-info').style.display = 'flex';
  document.getElementById('csv-file-name').textContent = file.name;
  document.getElementById('btn-import').disabled = false;
  document.getElementById('import-result').style.display = 'none';
}
function clearCSV() {
  csvFile = null;
  document.getElementById('csv-file-info').style.display = 'none';
  document.getElementById('csv-file-name').textContent = '—';
  document.getElementById('btn-import').disabled = true;
  document.getElementById('csv-file-input').value = '';
  document.getElementById('import-result').style.display = 'none';
}

async function importCSV() {
  if (!csvFile) return;
  const btn = document.getElementById('btn-import');
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando…';

  const fd = new FormData();
  fd.append('file', csvFile);

  const data = await apiFetch('/api/exchanges/import-csv', { method: 'POST', body: fd });
  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-file-import"></i> Importar';

  const result = document.getElementById('import-result');
  result.style.display = 'block';

  if (!data.ok) {
    result.className = 'import-result error';
    result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${data.error || 'Erro na importação'}`;
    return;
  }

  if (data.imported > 0) {
    result.className = 'import-result success';
    result.innerHTML = `<i class="fa-solid fa-circle-check"></i>
      <strong>${data.imported} transaç${data.imported === 1 ? 'ão importada' : 'ões importadas'}</strong> com sucesso!
      ${data.errors?.length ? `<br><small style="color:var(--text-muted)">${data.errors.length} linha(s) ignoradas por formato inválido.</small>` : ''}`;
    loadKeys();
  } else {
    result.className = 'import-result warning';
    result.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>
      Nenhuma transação nova encontrada. Verifique se o formato do CSV é compatível.
      ${data.errors?.length ? '<br><small style="opacity:.7">' + data.errors.slice(0, 2).join(' | ') + '</small>' : ''}`;
  }
}

// ── Toast (global fallback) ───────────────────────────────────

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) { console.log(msg); return; }
  const t = document.createElement('div');
  const color = { success: '#3fb950', error: '#f85149', info: '#8b949e' }[type] || '#8b949e';
  t.style.cssText = `background:var(--bg-card);border:1px solid ${color};color:var(--text-primary);
    padding:12px 18px;border-radius:8px;font-size:13px;max-width:320px;
    box-shadow:0 4px 24px rgba(0,0,0,.4);opacity:0;transition:opacity .2s;`;
  t.textContent = msg;
  container.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; });
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 200);
  }, 4000);
}

// ── Init ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadKeys();

  document.getElementById('connect-form').addEventListener('submit', submitConnect);

  const dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover',  handleDragOver);
  dz.addEventListener('dragleave', handleDragLeave);
  dz.addEventListener('drop',      handleDrop);
  document.getElementById('csv-file-input').addEventListener('change', handleFileSelect);
});
