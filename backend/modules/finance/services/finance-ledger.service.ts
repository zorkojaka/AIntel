import type { PipelineStage } from 'mongoose';
import { FinanceSnapshotModel } from '../schemas/finance-snapshot';

// Keep original invoices immutable; expose each issued credit as its own dated entry.
export function financeLedgerPipeline(filter: Record<string, unknown> = {}): PipelineStage[] {
  return [
    { $match: { superseded: { $ne: true } } },
    { $project: { entries: { $concatArrays: [['$$ROOT'], { $ifNull: ['$creditNotes.finance', []] }] } } },
    { $unwind: '$entries' },
    { $replaceRoot: { newRoot: '$entries' } },
    { $unset: 'creditNotes' },
    { $match: filter },
  ];
}

export async function listFinanceLedger(filter: Record<string, unknown> = {}) {
  return FinanceSnapshotModel.aggregate(financeLedgerPipeline(filter));
}

export async function assertInvoiceHasNoCredits(invoiceVersionId: string) {
  if (await FinanceSnapshotModel.exists({ invoiceVersionId, 'creditNotes.0': { $exists: true } })) {
    throw new Error('Račun ima izdane dobropise in mora ostati ohranjen. Ni ga mogoče odstraniti ali zamenjati s popravkom.');
  }
}
