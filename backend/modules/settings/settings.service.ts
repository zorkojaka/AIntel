import { SettingsModel, Settings, DocumentPrefix } from './Settings';

export type SettingsUpdate = Partial<Omit<Settings, 'documentPrefix'>> & {
  documentPrefix?: Partial<DocumentPrefix>;
};

const DEFAULT_SETTINGS: Settings = {
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

let cachedSettings: Settings | null = null;

function normalizePrefix(partial?: Partial<DocumentPrefix>): DocumentPrefix {
  return {
    offer: (partial?.offer ?? DEFAULT_SETTINGS.documentPrefix.offer).trim(),
    invoice: (partial?.invoice ?? DEFAULT_SETTINGS.documentPrefix.invoice).trim(),
    order: (partial?.order ?? DEFAULT_SETTINGS.documentPrefix.order).trim(),
    deliveryNote: (partial?.deliveryNote ?? DEFAULT_SETTINGS.documentPrefix.deliveryNote).trim(),
    workOrder: (partial?.workOrder ?? DEFAULT_SETTINGS.documentPrefix.workOrder).trim()
  };
}

function sanitizeSettings(payload: SettingsUpdate): Settings {
  const base = cachedSettings ?? DEFAULT_SETTINGS;
  return {
    companyName: typeof payload.companyName === 'string' ? payload.companyName.trim() : base.companyName,
    address: typeof payload.address === 'string' ? payload.address.trim() : base.address,
    email: typeof payload.email === 'string' ? payload.email.trim() : base.email,
    phone: typeof payload.phone === 'string' ? payload.phone.trim() : base.phone,
    logoUrl: typeof payload.logoUrl === 'string' ? payload.logoUrl.trim() : base.logoUrl,
    primaryColor: typeof payload.primaryColor === 'string' ? payload.primaryColor.trim() : base.primaryColor,
    documentPrefix: normalizePrefix(payload.documentPrefix),
    defaultPaymentTerms:
      typeof payload.defaultPaymentTerms === 'string'
        ? payload.defaultPaymentTerms.trim()
        : base.defaultPaymentTerms,
    disclaimer: typeof payload.disclaimer === 'string' ? payload.disclaimer.trim() : base.disclaimer
  };
}

function removeInternalFields<T extends { key?: unknown; _id?: unknown; __v?: unknown }>(document: T): Settings {
  const { key: _key, __v: _version, _id: _id, ...rest } = document as unknown as Settings & Record<string, unknown>;
  return rest;
}

export async function ensureSettingsDocument(): Promise<Settings> {
  const existing = await SettingsModel.findOne({ key: 'global' }).lean();
  if (existing) {
    const sanitized = removeInternalFields(existing);
    cachedSettings = sanitized;
    return sanitized;
  }

  const created = await SettingsModel.create({ key: 'global', ...DEFAULT_SETTINGS });
  const sanitized = removeInternalFields(created.toObject());
  cachedSettings = sanitized;
  return sanitized;
}

export async function getSettings(forceRefresh = false): Promise<Settings> {
  if (!forceRefresh && cachedSettings) {
    return cachedSettings;
  }
  return ensureSettingsDocument();
}

export async function updateSettings(payload: SettingsUpdate): Promise<Settings> {
  const next = sanitizeSettings(payload);
  const updated = await SettingsModel.findOneAndUpdate(
    { key: 'global' },
    { $set: next },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (!updated) {
    cachedSettings = next;
    return next;
  }

  const sanitized = removeInternalFields(updated);
  cachedSettings = sanitized;
  return sanitized;
}

export { DEFAULT_SETTINGS };
