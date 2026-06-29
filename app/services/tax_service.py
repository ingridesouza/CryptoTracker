"""
tax_service.py — Motor de IR para cripto (regras Receita Federal BR)

Regras implementadas:
- Isenção: total de vendas no mês ≤ R$35.000 → não há imposto
- Custo médio ponderado das unidades vendidas (FIFO não é obrigatório no BR)
- Alíquotas progressivas sobre o ganho líquido
- Compensação de prejuízo mês a mês (acumulado no ano)
- DARF: vence no último dia útil do mês seguinte
"""

import calendar
from datetime import date, timedelta
from app.utils.database import get_db_connection

ISENCAO_MENSAL = 35_000.0  # R$35.000/mês de vendas → isento

ALIQUOTAS = [
    (5_000_000,      0.15),
    (10_000_000,     0.175),
    (30_000_000,     0.20),
    (float('inf'),   0.225),
]

MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']


def _last_business_day(year, month):
    """Último dia útil do mês seguinte ao indicado."""
    ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
    last = calendar.monthrange(ny, nm)[1]
    d = date(ny, nm, last)
    while d.weekday() >= 5:   # sáb=5, dom=6
        d -= timedelta(days=1)
    return d.isoformat()


def _apply_rate(gain):
    for limit, rate in ALIQUOTAS:
        if gain <= limit:
            return rate, round(gain * rate, 2)
    return 0.225, round(gain * 0.225, 2)


def _get_paid_months(user_id, year):
    conn = get_db_connection()
    rows = conn.execute(
        'SELECT month, status FROM tax_records WHERE user_id = ? AND year = ?',
        (user_id, year)
    ).fetchall()
    conn.close()
    return {r['month']: r['status'] for r in rows}


def calculate_monthly_ir(user_id, year, month, loss_carryforward=0.0):
    """
    Calcula IR de um mês específico.
    Retorna dicionário completo com status, valores e transações detalhadas.
    """
    conn = get_db_connection()
    all_txs = conn.execute(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY date ASC, created_at ASC',
        (user_id,)
    ).fetchall()
    conn.close()

    all_txs = [dict(t) for t in all_txs]
    month_prefix = f'{year}-{month:02d}'
    month_sells  = [t for t in all_txs if t['type'] == 'sell' and t['date'].startswith(month_prefix)]

    if not month_sells:
        return {
            'year': year, 'month': month, 'month_name': MONTH_NAMES[month - 1],
            'status': 'no_movement',
            'total_sold_brl': 0, 'total_cost_brl': 0,
            'gross_gain_brl': 0, 'net_gain_brl': 0,
            'loss_carryforward_used': 0, 'loss_carryforward_in': round(loss_carryforward, 2),
            'tax_rate': 0, 'tax_due_brl': 0,
            'tax_exempt': False, 'darf_due_date': None,
            'sells': [],
        }

    total_sold_brl = 0
    total_cost_brl = 0
    detailed_sells = []

    for sell in month_sells:
        cid = sell['crypto_id']
        buys_before = [t for t in all_txs
                       if t['crypto_id'] == cid and t['type'] == 'buy'
                       and (t['date'] < sell['date'] or
                            (t['date'] == sell['date'] and t['created_at'] <= sell['created_at']))]
        sells_before = [t for t in all_txs
                        if t['crypto_id'] == cid and t['type'] == 'sell'
                        and t['id'] != sell['id']
                        and (t['date'] < sell['date'] or
                             (t['date'] == sell['date'] and t['created_at'] < sell['created_at']))]

        total_buy_qty  = sum(t['quantity'] for t in buys_before)
        total_buy_cost = sum(t['quantity'] * t['price_brl'] for t in buys_before)
        avg_cost = total_buy_cost / total_buy_qty if total_buy_qty > 0 else 0

        proceeds  = sell['quantity'] * sell['price_brl']
        cost_this = sell['quantity'] * avg_cost
        gain      = proceeds - cost_this

        total_sold_brl += proceeds
        total_cost_brl += cost_this
        detailed_sells.append({
            'id':             sell['id'],
            'date':           sell['date'],
            'crypto_name':    sell['crypto_name'],
            'crypto_symbol':  sell['crypto_symbol'],
            'quantity':       sell['quantity'],
            'price_brl':      sell['price_brl'],
            'proceeds_brl':   round(proceeds, 2),
            'cost_brl':       round(cost_this, 2),
            'gain_brl':       round(gain, 2),
            'avg_cost_brl':   round(avg_cost, 2),
        })

    gross_gain = round(total_sold_brl - total_cost_brl, 2)
    exempt     = total_sold_brl <= ISENCAO_MENSAL

    if exempt:
        return {
            'year': year, 'month': month, 'month_name': MONTH_NAMES[month - 1],
            'status': 'exempt',
            'total_sold_brl': round(total_sold_brl, 2),
            'total_cost_brl': round(total_cost_brl, 2),
            'gross_gain_brl': gross_gain,
            'net_gain_brl':   gross_gain,
            'loss_carryforward_used': 0,
            'loss_carryforward_in': round(loss_carryforward, 2),
            'tax_rate': 0, 'tax_due_brl': 0,
            'tax_exempt': True, 'darf_due_date': None,
            'sells': detailed_sells,
        }

    # Compensação de prejuízo
    if gross_gain <= 0:
        return {
            'year': year, 'month': month, 'month_name': MONTH_NAMES[month - 1],
            'status': 'loss',
            'total_sold_brl': round(total_sold_brl, 2),
            'total_cost_brl': round(total_cost_brl, 2),
            'gross_gain_brl': gross_gain,
            'net_gain_brl':   gross_gain,
            'loss_carryforward_used': 0,
            'loss_carryforward_in': round(loss_carryforward, 2),
            'tax_rate': 0, 'tax_due_brl': 0,
            'tax_exempt': False, 'darf_due_date': _last_business_day(year, month),
            'sells': detailed_sells,
        }

    loss_used = min(loss_carryforward, gross_gain)
    net_gain  = gross_gain - loss_used

    if net_gain <= 0:
        return {
            'year': year, 'month': month, 'month_name': MONTH_NAMES[month - 1],
            'status': 'offset',
            'total_sold_brl': round(total_sold_brl, 2),
            'total_cost_brl': round(total_cost_brl, 2),
            'gross_gain_brl': gross_gain,
            'net_gain_brl':   round(net_gain, 2),
            'loss_carryforward_used': round(loss_used, 2),
            'loss_carryforward_in': round(loss_carryforward, 2),
            'tax_rate': 0, 'tax_due_brl': 0,
            'tax_exempt': False, 'darf_due_date': _last_business_day(year, month),
            'sells': detailed_sells,
        }

    tax_rate, tax_due = _apply_rate(net_gain)

    return {
        'year': year, 'month': month, 'month_name': MONTH_NAMES[month - 1],
        'status': 'pending',
        'total_sold_brl': round(total_sold_brl, 2),
        'total_cost_brl': round(total_cost_brl, 2),
        'gross_gain_brl': gross_gain,
        'net_gain_brl':   round(net_gain, 2),
        'loss_carryforward_used': round(loss_used, 2),
        'loss_carryforward_in': round(loss_carryforward, 2),
        'tax_rate': tax_rate,
        'tax_due_brl': tax_due,
        'tax_exempt': False,
        'darf_due_date': _last_business_day(year, month),
        'sells': detailed_sells,
    }


def get_yearly_ir(user_id, year):
    """
    Calcula IR para todos os 12 meses do ano, com compensação acumulada de prejuízo.
    Integra status 'pago' do banco de dados.
    """
    paid_map = _get_paid_months(user_id, year)
    months   = []
    carry    = 0.0

    for m in range(1, 13):
        data = calculate_monthly_ir(user_id, year, m, loss_carryforward=carry)

        # Atualizar carry forward
        if data['gross_gain_brl'] < 0:
            carry += abs(data['gross_gain_brl'])
        elif data['loss_carryforward_used'] > 0:
            carry = max(0.0, carry - data['loss_carryforward_used'])

        # Override com status pago do banco
        if paid_map.get(m) == 'paid' and data['tax_due_brl'] > 0:
            data['status'] = 'paid'

        months.append(data)

    total_due     = sum(m['tax_due_brl'] for m in months if m['status'] in ('pending', 'paid'))
    total_paid    = sum(m['tax_due_brl'] for m in months if m['status'] == 'paid')
    total_pending = sum(m['tax_due_brl'] for m in months if m['status'] == 'pending')

    return {
        'year': year,
        'months': months,
        'summary': {
            'total_tax_due':     round(total_due, 2),
            'total_tax_paid':    round(total_paid, 2),
            'total_tax_pending': round(total_pending, 2),
            'exempt_months':     sum(1 for m in months if m['status'] == 'exempt'),
            'loss_months':       sum(1 for m in months if m['status'] == 'loss'),
            'total_gain_brl':    round(sum(m['gross_gain_brl'] for m in months if m['gross_gain_brl'] > 0), 2),
            'cumulative_loss':   round(carry, 2),
        },
    }


def mark_as_paid(user_id, year, month):
    data = calculate_monthly_ir(user_id, year, month)
    conn = get_db_connection()
    conn.execute(
        '''INSERT OR REPLACE INTO tax_records
           (user_id, year, month, total_sold_brl, total_cost_brl,
            gross_gain_brl, tax_due_brl, tax_rate, status, darf_due_date, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, CURRENT_TIMESTAMP)''',
        (user_id, year, month, data['total_sold_brl'], data['total_cost_brl'],
         data['gross_gain_brl'], data['tax_due_brl'], data['tax_rate'],
         data['darf_due_date'])
    )
    conn.commit()
    conn.close()


def unmark_as_paid(user_id, year, month):
    conn = get_db_connection()
    conn.execute(
        'DELETE FROM tax_records WHERE user_id = ? AND year = ? AND month = ?',
        (user_id, year, month)
    )
    conn.commit()
    conn.close()
