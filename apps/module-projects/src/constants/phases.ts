export const PHASE_LABELS = {
  offer: 'Ponudba',
  order: 'Naročilnica',
  workOrder: 'Delovni nalog',
  deliveryNote: 'Dobavnica',
  invoice: 'Račun'
} as const;

export const PHASE_STATUS_LABELS = {
  pending: 'Čaka',
  completed: 'Dokončano'
} as const;
