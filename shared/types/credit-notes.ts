export interface CreditNoteItem {
  invoiceItemId: string;
  name: string;
  unit: string;
  quantity: number;
  vatPercent: number;
  totalWithoutVat: number;
  vatAmount: number;
  totalWithVat: number;
}

export interface CreditNote {
  id: string;
  number: string;
  invoiceVersionId: string;
  invoiceNumber: string;
  issuedAt: string;
  issuedBy: string;
  issuedByUserId: string | null;
  reason: string;
  customer?: { name: string; taxId: string; address: string };
  items: CreditNoteItem[];
  summary: { totalWithoutVat: number; vatAmount: number; totalWithVat: number };
}

export interface CreditNoteOptions {
  notes: CreditNote[];
  items: Array<{ id: string; name: string; unit: string; invoiceQuantity: number; remainingQuantity: number }>;
  invoiceNumber: string;
  creditedAmount: number;
  netTotalWithVat: number;
}
