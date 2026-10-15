/**
 * The invoice and receipt "paper" as HTML — one implementation shared by the editor's live
 * preview, the invoice page, and the printable PDF page served by the API.
 *
 * Every value is HTML-escaped. Styles are inline with fixed colours so the paper looks the same
 * in light and dark mode and when printed (it is white paper either way).
 */
import { formatDate, formatInr } from '../money';
import type { InvoicePaperData, PaymentView } from '../schemas/billing';

export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );

const e = escapeHtml;
const muted = 'color:#6b7280';
const lineAmount = (l: { quantity: number; unitPricePaise: number }) =>
  Math.round(l.quantity * l.unitPricePaise);
const qty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0$/, ''));

const STATUS_STYLE: Record<string, string> = {
  Paid: 'background:#dcfce7;color:#166534',
  Overdue: 'background:#fee2e2;color:#991b1b',
  Void: 'background:#f3f4f6;color:#4b5563',
  Draft: 'background:#f3f4f6;color:#4b5563',
  'Partially paid': 'background:#fef3c7;color:#92400e',
  Sent: 'background:#e0e7ff;color:#3730a3'
};

export const DEFAULT_INVOICE_TERMS =
  'Payment due within the stated terms. Late payments may attract interest at 1.5% per month.';

export function renderInvoicePaper(d: InvoicePaperData): string {
  const th = (t: string, right = false) =>
    `<th style="text-align:${right ? 'right' : 'left'};padding:10px;font-size:11px;${muted};text-transform:uppercase;letter-spacing:.05em;font-weight:600">${t}</th>`;
  const td = (v: string, extra = '') =>
    `<td style="padding:10px;border-bottom:1px solid #f3f4f6;${extra}">${v}</td>`;
  const row = (label: string, value: string, extra = '') =>
    `<div style="display:flex;justify-content:space-between;gap:12px;${extra}"><span${extra ? '' : ` style="${muted}"`}>${label}</span><span>${value}</span></div>`;
  const status = d.status
    ? `<div style="margin-top:6px;display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;${STATUS_STYLE[d.status] ?? STATUS_STYLE.Sent}">${e(d.status.toUpperCase())}</div>`
    : '';
  const lines = d.lines.length
    ? d.lines
        .map(
          (l, i) =>
            `<tr>${td(String(i + 1), muted)}${td(`${e(l.description || '—')}<div style="font-size:11px;${muted}">SAC 998314</div>`)}${td(qty(l.quantity), 'text-align:right')}${td(e(formatInr(l.unitPricePaise)), 'text-align:right')}${td(e(formatInr(lineAmount(l))), 'text-align:right;font-weight:500')}</tr>`
        )
        .join('')
    : `<tr>${td('', '')}${td(`<span style="${muted}">No lines yet</span>`)}${td('')}${td('')}${td('')}</tr>`;
  const half = (n: number) => e(formatInr(n));

  return `<div class="dsol-paper" style="background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:10px;padding:clamp(18px,4vw,36px);display:flex;flex-direction:column;gap:24px;font:13px/1.5 Inter,system-ui,sans-serif">
  <div style="display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <span style="width:44px;height:44px;border-radius:10px;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none">${e(initials(d.seller.company))}</span>
      <div><div style="font-weight:700;font-size:17px">${e(d.seller.company)}</div>
      <div style="font-size:12px;${muted};white-space:pre-line">${e(d.seller.address ?? '')}${d.seller.gstin ? `<br>GSTIN ${e(d.seller.gstin)}` : ''}</div></div>
    </div>
    <div style="text-align:right"><div style="font-size:22px;font-weight:700;letter-spacing:-.02em">INVOICE</div>
      <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px">${e(d.number || 'Number on save')}</div>${status}</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:20px;padding:16px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
    <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;${muted}">Bill to</div>
      <div style="font-weight:600">${e(d.client.name || 'Select a client')}</div>
      <div style="font-size:12px;${muted}">${e(d.client.address)}${d.client.gstin ? `<br>GSTIN ${e(d.client.gstin)}` : ''}</div></div>
    <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;${muted}">Project</div><div>${e(d.projectName ?? '—')}</div></div>
    <div style="text-align:right"><div><span style="${muted}">Invoice date</span> ${e(formatDate(d.issueDate))}</div>
      <div><span style="${muted}">Due date</span> <b>${e(formatDate(d.dueDate))}</b></div>
      <div><span style="${muted}">Terms</span> ${e(d.client.terms ?? '—')}</div></div>
  </div>
  <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:420px">
    <thead><tr style="background:#f9fafb">${th('#')}${th('Description')}${th('Qty', true)}${th('Unit price', true)}${th('Amount', true)}</tr></thead>
    <tbody>${lines}</tbody></table></div>
  <div style="display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap">
    <div style="flex:1 1 240px;font-size:12px">
      <div style="font-weight:600;margin-bottom:4px">Payment instructions</div><div style="white-space:pre-line;${muted}">${e(d.paymentInstructions ?? '—')}</div>
      ${d.notes ? `<div style="font-weight:600;margin:12px 0 4px">Notes</div><div style="white-space:pre-line;${muted}">${e(d.notes)}</div>` : ''}
    </div>
    <div style="flex:0 1 280px;min-width:220px;display:flex;flex-direction:column;gap:6px">
      ${row('Subtotal', half(d.subtotalPaise))}
      ${d.discountPaise ? row(`Discount (${d.discountPct}%)`, `− ${half(d.discountPaise)}`) : ''}
      ${d.taxPaise ? row(`CGST ${d.gstRate / 2}%`, half(d.cgstPaise)) + row(`SGST ${d.gstRate / 2}%`, half(d.sgstPaise)) : ''}
      ${row('Total', half(d.totalPaise), 'font-weight:700;font-size:16px;border-top:2px solid #111827;padding-top:8px;margin-top:4px')}
      ${d.paidPaise ? row('Paid', `− ${half(d.paidPaise)}`, 'color:#166534') + row('Balance due', half(d.balancePaise), 'font-weight:600') : ''}
    </div>
  </div>
  <div style="font-size:11px;border-top:1px solid #e5e7eb;padding-top:12px;${muted}">${e(d.terms || DEFAULT_INVOICE_TERMS)} This is a computer-generated invoice.</div>
</div>`;
}

export function renderReceiptPaper(
  p: PaymentView,
  seller: InvoicePaperData['seller'],
  balanceAfterPaise: number
): string {
  const kv = (k: string, v: string, mono = false) =>
    `<span style="${muted}">${k}</span><span style="${mono ? "font-family:'JetBrains Mono',ui-monospace,monospace" : ''}">${v}</span>`;
  return `<div class="dsol-paper" style="background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:10px;padding:24px;display:flex;flex-direction:column;gap:16px;font:13px/1.5 Inter,system-ui,sans-serif">
  <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <div><div style="font-weight:700;font-size:16px">${e(seller.company)}</div><div style="font-size:11px;${muted};white-space:pre-line">${e(seller.address ?? '')}${seller.gstin ? `<br>GSTIN ${e(seller.gstin)}` : ''}</div></div>
    <div style="text-align:right"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;${muted}">Payment receipt</div>
      <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:600">${e(p.receiptNo)}</div><div style="font-size:12px;${muted}">${e(formatDate(p.paidOn))}</div></div>
  </div>
  <div style="text-align:center;padding:14px;border-radius:8px;background:#f0fdf4;color:#166534"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">Amount received</div><div style="font-size:26px;font-weight:700">${e(formatInr(p.amountPaise))}</div></div>
  <div style="display:grid;grid-template-columns:130px 1fr;gap:8px 12px;font-size:12.5px">
    ${kv('Received from', `<b>${e(p.clientName)}</b>`)}${kv('Against invoice', e(p.invoiceNo), true)}${kv('Payment method', e(p.method))}${kv('Transaction ref.', e(p.reference), true)}${p.note ? kv('Note', e(p.note)) : ''}${kv('Balance remaining', e(formatInr(balanceAfterPaise)))}
  </div>
  <div style="font-size:11px;border-top:1px dashed #d1d5db;padding-top:10px;${muted}">This is a computer-generated receipt and does not require a signature.</div>
</div>`;
}

/** A complete A4 page around a paper, which opens the print dialog ("Save as PDF"). */
export function printablePage(title: string, paper: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>body{margin:24px;background:#f3f4f6;font-family:Inter,system-ui,sans-serif}.page{max-width:820px;margin:auto}
@page{size:A4;margin:12mm}@media print{body{margin:0;background:#fff}.dsol-paper{border:0!important;padding:0!important}.no-print{display:none}}</style>
</head><body><div class="no-print" style="max-width:820px;margin:0 auto 12px;font-size:13px;color:#6b7280">Use your browser's “Save as PDF” in the print dialog.</div><div class="page">${paper}</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script></body></html>`;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(w => /[a-z0-9]/i.test(w[0] ?? ''))
      .slice(0, 2)
      .map(w => w[0]!.toUpperCase())
      .join('') || 'DS'
  );
}
