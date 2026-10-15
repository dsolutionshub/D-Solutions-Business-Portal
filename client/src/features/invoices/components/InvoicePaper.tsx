import {
  renderInvoicePaper,
  renderReceiptPaper,
  type InvoicePaperData,
  type PaymentView
} from '@dsol/shared';

/**
 * The invoice as it is printed. The HTML comes from @dsol/shared — the same renderer the API uses
 * for the PDF page — and every value in it is escaped there.
 */
export function InvoicePaper({ data }: { data: InvoicePaperData }) {
  return <div dangerouslySetInnerHTML={{ __html: renderInvoicePaper(data) }} />;
}

export function ReceiptPaper({
  payment,
  seller,
  balancePaise
}: {
  payment: PaymentView;
  seller: InvoicePaperData['seller'];
  balancePaise: number;
}) {
  return <div dangerouslySetInnerHTML={{ __html: renderReceiptPaper(payment, seller, balancePaise) }} />;
}
