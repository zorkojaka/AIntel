export const STATUS_LABELS = {
  draft: 'Osnutek',
  confirmed: 'Potrjeno',
  scheduled: 'Termin določen',
  executed: 'Izvedeno',
  completed: 'Zaključeno'
} as const;

export const STATUS_OPTIONS = [
  { value: '', label: 'Vsi statusi' },
  { value: 'draft', label: STATUS_LABELS.draft },
  { value: 'confirmed', label: STATUS_LABELS.confirmed },
  { value: 'scheduled', label: STATUS_LABELS.scheduled },
  { value: 'executed', label: STATUS_LABELS.executed },
  { value: 'completed', label: STATUS_LABELS.completed }
];
