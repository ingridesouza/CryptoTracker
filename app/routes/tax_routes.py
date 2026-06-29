import io
import csv
from flask import Blueprint, jsonify, request, Response
from flask_login import login_required, current_user
from app.services.tax_service import (
    get_yearly_ir, calculate_monthly_ir, mark_as_paid, unmark_as_paid
)

tax_bp = Blueprint('tax', __name__)

MONTH_NAMES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
STATUS_LABELS = {
    'no_movement': 'Sem movimento',
    'exempt':      'Isento',
    'pending':     'A pagar',
    'paid':        'Pago',
    'loss':        'Prejuízo',
    'offset':      'Compensado',
}


@tax_bp.route('/api/tax/yearly/<int:year>')
@login_required
def yearly_tax(year):
    return jsonify(get_yearly_ir(current_user.id, year))


@tax_bp.route('/api/tax/monthly/<int:year>/<int:month>')
@login_required
def monthly_tax(year, month):
    return jsonify(calculate_monthly_ir(current_user.id, year, month))


@tax_bp.route('/api/tax/monthly/<int:year>/<int:month>/pay', methods=['POST'])
@login_required
def mark_paid(year, month):
    mark_as_paid(current_user.id, year, month)
    return jsonify({'success': True})


@tax_bp.route('/api/tax/monthly/<int:year>/<int:month>/unpay', methods=['POST'])
@login_required
def unmark_paid(year, month):
    unmark_as_paid(current_user.id, year, month)
    return jsonify({'success': True})


@tax_bp.route('/api/tax/export/<int:year>')
@login_required
def export_csv(year):
    data = get_yearly_ir(current_user.id, year)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Mês', 'Vendas Totais (R$)', 'Custo Médio (R$)', 'Ganho Bruto (R$)',
        'Ganho Líquido (R$)', 'Alíquota', 'DARF (R$)', 'Status', 'Vencimento DARF',
    ])
    for m in data['months']:
        writer.writerow([
            f'{MONTH_NAMES_SHORT[m["month"]-1]}/{year}',
            f'{m["total_sold_brl"]:.2f}',
            f'{m["total_cost_brl"]:.2f}',
            f'{m["gross_gain_brl"]:.2f}',
            f'{m["net_gain_brl"]:.2f}',
            f'{m["tax_rate"]*100:.1f}%' if m['tax_rate'] else '—',
            f'{m["tax_due_brl"]:.2f}',
            STATUS_LABELS.get(m['status'], m['status']),
            m['darf_due_date'] or '—',
        ])

    # Linha de totais
    s = data['summary']
    writer.writerow([])
    writer.writerow(['RESUMO DO ANO'])
    writer.writerow(['Total de ganhos', f'{s["total_gain_brl"]:.2f}'])
    writer.writerow(['Total de IR devido', f'{s["total_tax_due"]:.2f}'])
    writer.writerow(['Total pago', f'{s["total_tax_paid"]:.2f}'])
    writer.writerow(['Total pendente', f'{s["total_tax_pending"]:.2f}'])
    writer.writerow(['Meses isentos', s['exempt_months']])
    writer.writerow(['Prejuízo acumulado', f'{s["cumulative_loss"]:.2f}'])

    output.seek(0)
    return Response(
        '﻿' + output.getvalue(),  # BOM para Excel reconhecer UTF-8
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment;filename=ir_cripto_{year}.csv'},
    )
