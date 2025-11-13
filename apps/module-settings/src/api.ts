import { ApiEnvelope, DocumentPrefixKey, SettingsDto } from './types';

export const DEFAULT_SETTINGS: SettingsDto = {
  companyName: 'Vaše podjetje d.o.o.',
  address: 'Glavna cesta 1, 1000 Ljubljana',
  email: 'info@vasepodjetje.si',
  phone: '+386 1 123 45 67',
  logoUrl: '',
  primaryColor: '#0f62fe',
  documentPrefix: {
    offer: 'PON-',
    invoice: 'RAC-',
    order: 'NOR-',
    deliveryNote: 'DOB-',
    workOrder: 'DEL-'
  },
  defaultPaymentTerms: 'Plačilo v 15 dneh po prejemu računa.',
  disclaimer: 'Avtomatsko generiran dokument. Prosimo, preverite podatke pred podpisom.'
};

export const DOCUMENT_PREFIX_LABELS: Record<DocumentPrefixKey, string> = {
  offer: 'Ponudba',
  invoice: 'Račun',
  order: 'Naročilnica',
  deliveryNote: 'Dobavnica',
  workOrder: 'Delovni nalog'
};

function mergeWithDefaults(partial?: Partial<SettingsDto>): SettingsDto {
  const documentPrefix = {
    ...DEFAULT_SETTINGS.documentPrefix,
    ...(partial?.documentPrefix ?? {})
  } as SettingsDto['documentPrefix'];

  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    documentPrefix
  };
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const payload: ApiEnvelope<T> = await response.json();
  if (!payload.success) {
    throw new Error(payload.error ?? 'Neznana napaka pri komunikaciji s strežnikom.');
  }
  return payload.data;
}

export async function fetchSettings(): Promise<SettingsDto> {
  const response = await fetch('/api/settings');
  const data = await parseEnvelope<SettingsDto>(response);
  return mergeWithDefaults(data);
}

export async function saveSettings(payload: SettingsDto): Promise<SettingsDto> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await parseEnvelope<SettingsDto>(response);
  return mergeWithDefaults(data);
}

export function applySettingsTheme(settings: SettingsDto) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  if (settings.primaryColor) {
    root.style.setProperty('--color-primary', settings.primaryColor);
    root.style.setProperty('--primary', settings.primaryColor);
    root.style.setProperty('--sidebar-primary', settings.primaryColor);
    root.style.setProperty('--ring', settings.primaryColor);
  }
}

export function createEmptySettings(): SettingsDto {
  return mergeWithDefaults();
}
