/* tax.js — Motor de IR: calendário anual, cálculo e DARF */

let currentYear = new Date().getFullYear();
let yearData    = null;
let selectedMonth = null;

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const STATUS = {
  no_movement: { label: 'Sem movimento', cls: 'badge-no_movement' },
  exempt:      { label: 'Isento',        cls: 'badge-exempt'      },
  pending:     { label: 'A pagar',       cls: 'badge-pending'     },
  paid:        { label: 'Pago',          cls: 'badge-paid'        },
  loss:        { label: 'Prejuízo',      cls: 'badge-loss'        },
  offset:      { label: 'Compensado',    cls: 'badge-offset'      },
};

// ── Formatação ────────────────────────────────────────────────

function fmtBRL(val) {
  return 'R$ ' + (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(rate) { return (rate * 100).toFixed(1) + '%'; }
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── Carregar dados do ano ─────────────────────────────────────

async function loadYear(year) {
  document.getElementById('year-display').textContent = year;
  document.getElementById('export-csv-btn').href = `/api/tax/export/${year}`;
  document.getElementById('month-grid').innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-muted)">
      <i class="fa-solid fa-spinner fa-spin"></i> Calculando…
    </div>`;
  document.getElementById('tax-detail-wrap').innerHTML = '';
  selectedMonth = null;

  try {
    const r = await fetch(`/api/tax/yearly/${year}`);
    yearData = await r.json();
    renderSummary(yearData.summary);
    renderMonths(yearData.months);
    renderAlerts(yearData.months);
  } catch {
    document.getElementById('month-grid').innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-muted)">
        Erro ao carregar dados. Verifique sua conexão.
      </div>`;
  }
}

// ── Summary cards ─────────────────────────────────────────────

function renderSummary(s) {
  document.getElementById('t-pending').textContent = fmtBRL(s.total_tax_pending);
  const pendingMonths = yearData.months.filter(m => m.status === 'pending').length;
  document.getElementById('t-pending-months').textContent =
    pendingMonths ? `em ${pendingMonths} mês${pendingMonths > 1 ? 'es' : ''}` : 'nenhum pendente';
  document.getElementById('t-paid').textContent   = fmtBRL(s.total_tax_paid);
  document.getElementById('t-exempt').textContent = s.exempt_months;
  document.getElementById('t-gain').textContent   = fmtBRL(s.total_gain_brl);
  document.getElementById('t-carry').textContent  =
    s.cumulative_loss > 0
      ? `Prejuízo a compensar: ${fmtBRL(s.cumulative_loss)}`
      : 'sem prejuízo acumulado';
  document.getElementById('t-carry').style.color =
    s.cumulative_loss > 0 ? 'var(--accent-red)' : 'var(--text-muted)';
}

// ── DARF alerts ───────────────────────────────────────────────

function renderAlerts(months) {
  const today   = new Date();
  const in7days = new Date(today); in7days.setDate(today.getDate() + 7);
  const container = document.getElementById('darf-alerts');
  const urgent = [];
  const overdue = [];

  months.forEach(m => {
    if (m.status !== 'pending' || !m.darf_due_date) return;
    const due = new Date(m.darf_due_date + 'T12:00:00');
    if (due < today)       overdue.push(m);
    else if (due <= in7days) urgent.push(m);
  });

  let html = '';
  if (overdue.length) {
    html += `<div class="darf-alert darf-alert-overdue">
      <i class="fa-solid fa-circle-exclamation" style="color:var(--accent-red)"></i>
      <div>
        <strong style="color:var(--accent-red)">DARF vencido!</strong>
        ${overdue.map(m => `<br>${m.month_name}: ${fmtBRL(m.tax_due_brl)} (venceu em ${fmtDate(m.darf_due_date)})`).join('')}
        — Regularize para evitar multa + juros.
      </div>
    </div>`;
  }
  if (urgent.length) {
    html += `<div class="darf-alert">
      <i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-yellow)"></i>
      <div>
        <strong style="color:var(--accent-yellow)">DARF vence em breve</strong>
        ${urgent.map(m => `<br>${m.month_name}: ${fmtBRL(m.tax_due_brl)} — vence em ${fmtDate(m.darf_due_date)}`).join('')}
      </div>
    </div>`;
  }
  container.innerHTML = html;
}

// ── Month grid ────────────────────────────────────────────────

function renderMonths(months) {
  const grid = document.getElementById('month-grid');
  grid.innerHTML = months.map(m => {
    const st = STATUS[m.status] || STATUS.no_movement;
    let valueHtml = '';
    if (m.status === 'pending') {
      valueHtml = `<div class="month-darf" style="color:var(--accent-yellow)">${fmtBRL(m.tax_due_brl)}</div>
                   <div class="month-due">Vence ${fmtDate(m.darf_due_date)}</div>`;
    } else if (m.status === 'paid') {
      valueHtml = `<div class="month-darf" style="color:var(--accent-green)">${fmtBRL(m.tax_due_brl)}</div>
                   <div class="month-due" style="color:var(--accent-green)">✓ Pago</div>`;
    } else if (m.status === 'exempt') {
      valueHtml = `<div class="month-darf" style="color:var(--text-muted)">Isento</div>
                   <div class="month-due">${fmtBRL(m.total_sold_brl)} vendidos</div>`;
    } else if (m.status === 'loss') {
      valueHtml = `<div class="month-darf" style="color:var(--accent-red)">${fmtBRL(m.gross_gain_brl)}</div>
                   <div class="month-due">Prejuízo — compensável</div>`;
    } else if (m.status === 'offset') {
      valueHtml = `<div class="month-darf">R$ 0,00</div>
                   <div class="month-due">Ganho compensado</div>`;
    } else {
      valueHtml = `<div class="month-darf" style="color:var(--text-muted)">—</div>`;
    }
    return `<div class="month-card" data-month="${m.month}" data-status="${m.status}">
      <div class="month-name">${m.month_name}</div>
      <span class="month-status-badge ${st.cls}">${st.label}</span>
      ${valueHtml}
    </div>`;
  }).join('');

  grid.querySelectorAll('.month-card').forEach(card => {
    card.addEventListener('click', () => {
      const mn = parseInt(card.dataset.month);
      if (selectedMonth === mn) {
        selectedMonth = null;
        document.querySelectorAll('.month-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('tax-detail-wrap').innerHTML = '';
        return;
      }
      selectedMonth = mn;
      document.querySelectorAll('.month-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      renderDetail(yearData.months[mn - 1]);
    });
  });
}

// ── Month detail panel ────────────────────────────────────────

function renderDetail(m) {
  const wrap = document.getElementById('tax-detail-wrap');
  const st   = STATUS[m.status] || STATUS.no_movement;

  // Cálculo section
  let calcHtml = '';
  if (m.status === 'no_movement') {
    calcHtml = `<div style="padding:24px;color:var(--text-muted);font-size:13px;text-align:center">
      Nenhuma venda registrada em ${m.month_name}.
    </div>`;
  } else {
    const exemptNote = m.tax_exempt
      ? `<div class="exemption-box">
           <i class="fa-solid fa-circle-check" style="color:var(--accent-green);margin-right:6px"></i>
           Vendas totais de ${fmtBRL(m.total_sold_brl)} estão abaixo do limite de isenção de R$35.000/mês.
           Nenhum imposto devido.
         </div>`
      : '';

    const carryRow = m.loss_carryforward_used > 0
      ? `<div class="calc-row">
           <span class="calc-label">Prejuízo compensado</span>
           <span class="calc-value" style="color:var(--accent-green)">- ${fmtBRL(m.loss_carryforward_used)}</span>
         </div>` : '';

    calcHtml = `<div class="tax-calc">
      <div class="calc-row">
        <span class="calc-label">Vendas totais</span>
        <span class="calc-value">${fmtBRL(m.total_sold_brl)}</span>
      </div>
      <div class="calc-row">
        <span class="calc-label">Custo médio das unidades</span>
        <span class="calc-value">- ${fmtBRL(m.total_cost_brl)}</span>
      </div>
      <div class="calc-divider"></div>
      <div class="calc-row">
        <span class="calc-label">Ganho bruto</span>
        <span class="calc-value ${m.gross_gain_brl >= 0 ? 'change-up' : 'change-down'}">${fmtBRL(m.gross_gain_brl)}</span>
      </div>
      ${carryRow}
      <div class="calc-row">
        <span class="calc-label">Ganho líquido tributável</span>
        <span class="calc-value">${fmtBRL(m.net_gain_brl)}</span>
      </div>
      ${m.tax_rate ? `<div class="calc-row">
        <span class="calc-label">Alíquota</span>
        <span class="calc-value">${fmtPct(m.tax_rate)}</span>
      </div>` : ''}
      <div class="calc-divider"></div>
      <div class="calc-row calc-total">
        <span class="calc-label">DARF a pagar</span>
        <span class="calc-value" style="color:${m.tax_due_brl > 0 ? 'var(--accent-yellow)' : 'var(--accent-green)'};font-size:18px">
          ${fmtBRL(m.tax_due_brl)}
        </span>
      </div>
      ${m.darf_due_date ? `<div class="calc-row">
        <span class="calc-label">Vencimento DARF</span>
        <span class="calc-value" style="font-size:12px">${fmtDate(m.darf_due_date)}</span>
      </div>` : ''}
      ${exemptNote}
    </div>`;
  }

  // Sells table
  let sellsHtml = '';
  if (m.sells && m.sells.length) {
    sellsHtml = `<div class="tax-sells">
      <div class="tax-sells-title">TRANSAÇÕES DE VENDA</div>
      <div class="sell-row sell-row-head" style="color:var(--text-muted);font-size:11px;font-weight:600;border-bottom:1px solid var(--border)">
        <span>Data</span><span>Moeda</span><span>Receita</span><span>Custo</span><span>Ganho</span>
      </div>
      ${m.sells.map(s => `<div class="sell-row">
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${s.date}</span>
        <span>
          <div style="font-weight:600;font-size:12px">${s.crypto_name}</div>
          <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${s.crypto_symbol} × ${s.quantity < 1 ? s.quantity.toFixed(6) : s.quantity.toFixed(4)}</div>
        </span>
        <span style="font-family:var(--font-mono);font-size:12px">${fmtBRL(s.proceeds_brl)}</span>
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${fmtBRL(s.cost_brl)}</span>
        <span class="${s.gain_brl >= 0 ? 'change-up' : 'change-down'}" style="font-family:var(--font-mono);font-size:12px;font-weight:600">
          ${s.gain_brl >= 0 ? '+' : ''}${fmtBRL(s.gain_brl)}
        </span>
      </div>`).join('')}
    </div>`;
  } else if (m.status !== 'no_movement') {
    sellsHtml = `<div class="tax-sells" style="color:var(--text-muted);font-size:13px;padding-top:32px;text-align:center">
      Nenhuma venda com custo calculável neste mês.
    </div>`;
  }

  // Action buttons
  const canPay   = m.status === 'pending';
  const canUnpay = m.status === 'paid';
  const footerBtns = (canPay || canUnpay) ? `
    <div>
      ${canPay ? `<button class="btn btn-primary" id="btn-mark-paid">
        <i class="fa-solid fa-circle-check"></i> Marcar DARF como pago
      </button>` : ''}
      ${canUnpay ? `<button class="btn btn-ghost btn-sm" id="btn-unmark-paid" style="color:var(--text-muted)">
        Desfazer pagamento
      </button>` : ''}
    </div>` : '<div></div>';

  wrap.innerHTML = `<div class="tax-detail">
    <div class="tax-detail-header">
      <div>
        <span style="font-size:17px;font-weight:700">${m.month_name} ${currentYear}</span>
        <span class="month-status-badge ${st.cls}" style="margin-left:10px">${st.label}</span>
      </div>
      <button onclick="document.getElementById('tax-detail-wrap').innerHTML='';
                       document.querySelectorAll('.month-card').forEach(c=>c.classList.remove('selected'));
                       selectedMonth=null;"
              class="btn btn-ghost btn-sm">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="tax-detail-body">
      ${calcHtml}
      ${sellsHtml}
    </div>
    <div class="tax-detail-footer">
      ${footerBtns}
      <a href="/api/tax/export/${currentYear}" class="btn btn-ghost btn-sm">
        <i class="fa-solid fa-file-csv"></i> Exportar ano CSV
      </a>
    </div>
  </div>`;

  // Bind action buttons
  document.getElementById('btn-mark-paid')?.addEventListener('click', async () => {
    await fetch(`/api/tax/monthly/${currentYear}/${m.month}/pay`, { method: 'POST' });
    await loadYear(currentYear);
    // Re-open the same month
    const card = document.querySelector(`.month-card[data-month="${m.month}"]`);
    card?.click();
  });
  document.getElementById('btn-unmark-paid')?.addEventListener('click', async () => {
    await fetch(`/api/tax/monthly/${currentYear}/${m.month}/unpay`, { method: 'POST' });
    await loadYear(currentYear);
    const card = document.querySelector(`.month-card[data-month="${m.month}"]`);
    card?.click();
  });

  // Scroll to detail
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Year navigation ───────────────────────────────────────────

document.getElementById('year-prev')?.addEventListener('click', () => {
  currentYear--;
  loadYear(currentYear);
});
document.getElementById('year-next')?.addEventListener('click', () => {
  currentYear++;
  loadYear(currentYear);
});

// ── Init ──────────────────────────────────────────────────────
loadYear(currentYear);
