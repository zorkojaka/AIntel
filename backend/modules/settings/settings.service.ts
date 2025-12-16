import { randomUUID } from 'crypto';
import {
  SettingsModel,
  Settings,
  DocumentPrefix,
  Note,
  NoteDefaultsByDoc,
  DocumentTypeKey,
  LegacyOfferClause,
  DocumentNumberingSettings,
  DocumentNumberingConfig,
} from './Settings';
import {
  buildPatternFromPrefix,
  DEFAULT_OFFER_NUMBER_PATTERN,
  ensureOfferNumberingConfig,
} from './document-numbering.util';

export type SettingsUpdate = Partial<Omit<Settings, 'documentPrefix'>> & {
  documentPrefix?: Partial<DocumentPrefix>;
  documentNumbering?: DocumentNumberingSettings;
};

const DOCUMENT_TYPE_KEYS: DocumentTypeKey[] = [
  'offer',
  'invoice',
  'workOrder',
  'materialOrder',
  'deliveryNote',
  'workOrderConfirmation',
  'creditNote',
];

const DEFAULT_SETTINGS: Settings = {
  companyName: 'Vase podjetje d.o.o.',
  address: 'Glavna cesta 1, 1000 Ljubljana',
  postalCode: '',
  city: '',
  country: '',
  email: 'info@vasepodjetje.si',
  phone: '+386 1 123 45 67',
  website: '',
  logoUrl: '',
  primaryColor: '#0f62fe',
  documentPrefix: {
    offer: 'PON-',
    invoice: 'RAC-',
    order: 'NOR-',
    deliveryNote: 'DOB-',
    workOrder: 'DEL-',
  },
  documentNumbering: {
    offer: {
      pattern: DEFAULT_OFFER_NUMBER_PATTERN,
      reset: 'yearly',
    },
  },
  iban: '',
  vatId: '',
  directorName: '',
  notes: [],
  noteDefaultsByDoc: createEmptyNoteDefaults(),
  defaultPaymentTerms: '',
  disclaimer: '',
  offerClauses: [],
};

let cachedSettings: Settings | null = null;

function createEmptyNoteDefaults(): NoteDefaultsByDoc {
  return {
    offer: [],
    invoice: [],
    workOrder: [],
    materialOrder: [],
    deliveryNote: [],
    workOrderConfirmation: [],
    creditNote: [],
  };
}

function normalizePrefix(partial?: Partial<DocumentPrefix>): DocumentPrefix {
  return {
    offer: (partial?.offer ?? DEFAULT_SETTINGS.documentPrefix.offer).trim(),
    invoice: (partial?.invoice ?? DEFAULT_SETTINGS.documentPrefix.invoice).trim(),
    order: (partial?.order ?? DEFAULT_SETTINGS.documentPrefix.order).trim(),
    deliveryNote: (partial?.deliveryNote ?? DEFAULT_SETTINGS.documentPrefix.deliveryNote).trim(),
    workOrder: (partial?.workOrder ?? DEFAULT_SETTINGS.documentPrefix.workOrder).trim(),
  };
}

function collectNotesFromLegacy(legacy: LegacyOfferClause[]): { notes: Note[]; legacyDefaults: string[] } {
  if (!Array.isArray(legacy)) {
    return { notes: [], legacyDefaults: [] };
  }

  const legacyDefaults: string[] = [];
  const notes = legacy
    .map((clause, index) => {
      if (!clause || typeof clause !== 'object') return null;
      const title = typeof clause.title === 'string' ? clause.title.trim() : '';
      const text = typeof clause.text === 'string' ? clause.text.trim() : '';
      if (!title || !text) return null;
      const category = clause.category;
      const normalizedCategory: Note['category'] =
        category === 'payment' || category === 'delivery' || category === 'costs' ? category : 'note';
      const id = clause.id?.trim() || randomUUID();
      if (clause.isDefault) {
        legacyDefaults.push(id);
      }
      return {
        id,
        title,
        text,
        category: normalizedCategory,
        sortOrder:
          typeof clause.sortOrder === 'number' && Number.isFinite(clause.sortOrder) ? clause.sortOrder : index,
      } as Note;
    })
    .filter((note): note is Note => note !== null)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((note, index) => ({ ...note, sortOrder: index }));

  return { notes, legacyDefaults };
}

function normalizeNotes(
  input: unknown,
  fallback: Note[],
  legacy: LegacyOfferClause[]
): { notes: Note[]; legacyDefaults: string[] } {
  if (Array.isArray(input)) {
    const sanitized = input
      .map((raw, index): Note | null => {
        if (!raw || typeof raw !== 'object') return null;
        const title = typeof (raw as Note).title === 'string' ? (raw as Note).title.trim() : '';
        const text = typeof (raw as Note).text === 'string' ? (raw as Note).text.trim() : '';
        if (!title || !text) return null;
        const category = (raw as Note).category;
        const normalizedCategory: Note['category'] =
          category === 'payment' || category === 'delivery' || category === 'costs' ? category : 'note';
        const idValue = typeof (raw as Note).id === 'string' ? (raw as Note).id.trim() : '';
        const id = idValue || randomUUID();
        const sortOrder =
          typeof (raw as Note).sortOrder === 'number' && Number.isFinite((raw as Note).sortOrder)
            ? (raw as Note).sortOrder
            : index;
        return { id, title, text, category: normalizedCategory, sortOrder };
      })
      .filter((note): note is Note => note !== null)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((note, index) => ({ ...note, sortOrder: index }));
    return { notes: sanitized, legacyDefaults: [] };
  }

  if (fallback && fallback.length) {
    return { notes: fallback, legacyDefaults: [] };
  }

  return collectNotesFromLegacy(legacy);
}

function normalizeNoteDefaults(
  input: unknown,
  fallback: NoteDefaultsByDoc,
  notes: Note[],
  legacyDefaults: string[]
): NoteDefaultsByDoc {
  const validIds = new Set(notes.map((note) => note.id));
  const order = notes.map((note) => note.id);

  const sanitizeList = (raw?: unknown): string[] | null => {
    if (!Array.isArray(raw)) return null;
    const seen = new Set<string>();
    const ordered: string[] = [];
    raw.forEach((value) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!validIds.has(trimmed) || seen.has(trimmed)) return;
      seen.add(trimmed);
      ordered.push(trimmed);
    });

    if (!ordered.length) return [];

    return ordered;
  };

  const pickSource = (key: DocumentTypeKey): string[] => {
    const fromInput = input && typeof input === 'object' ? sanitizeList((input as Record<string, unknown>)[key]) : null;
    if (fromInput !== null) {
      return reorderByNotes(fromInput, order);
    }

    const fromFallback =
      fallback && typeof fallback === 'object' ? sanitizeList((fallback as Record<string, unknown>)[key]) : null;
    if (fromFallback !== null) {
      return reorderByNotes(fromFallback, order);
    }

    if (key === 'offer' && legacyDefaults.length) {
      return reorderByNotes(legacyDefaults, order);
    }

    return [];
  };

  const result = createEmptyNoteDefaults();
  DOCUMENT_TYPE_KEYS.forEach((key) => {
    result[key] = pickSource(key);
  });
  return result;
}

function reorderByNotes(input: string[], order: string[]): string[] {
  const orderMap = new Map(order.map((id, index) => [id, index]));
  return [...new Set(input)]
    .filter((id) => orderMap.has(id))
    .sort((a, b) => {
      const indexA = orderMap.get(a) ?? 0;
      const indexB = orderMap.get(b) ?? 0;
      return indexA - indexB;
    });
}

function sanitizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeDocumentNumbering(
  input: DocumentNumberingSettings | undefined,
  base: Settings,
  documentPrefix: DocumentPrefix
): DocumentNumberingSettings {
  const target: DocumentNumberingSettings = {};
  if (input?.offer) {
    target.offer = ensureOfferNumberingConfig(input.offer);
    return target;
  }
  if (base.documentNumbering?.offer) {
    target.offer = ensureOfferNumberingConfig(base.documentNumbering.offer);
    return target;
  }
  const fallbackPattern = buildPatternFromPrefix(documentPrefix.offer);
  target.offer = ensureOfferNumberingConfig({
    pattern: fallbackPattern,
    reset: 'yearly',
  });
  return target;
}

function sanitizeSettings(payload: SettingsUpdate, baseOverride?: Settings): Settings {
  const base = baseOverride ?? cachedSettings ?? DEFAULT_SETTINGS;
  const legacySource = (payload.offerClauses ?? base.offerClauses ?? []) as LegacyOfferClause[];
  const { notes, legacyDefaults } = normalizeNotes(
    payload.notes,
    base.notes ?? [],
    Array.isArray(legacySource) ? legacySource : []
  );
  const noteDefaults = normalizeNoteDefaults(
    payload.noteDefaultsByDoc,
    base.noteDefaultsByDoc ?? createEmptyNoteDefaults(),
    notes,
    legacyDefaults
  );

  const documentPrefix = normalizePrefix(payload.documentPrefix);

  return {
    companyName: sanitizeString(payload.companyName, base.companyName),
    address: sanitizeString(payload.address, base.address),
    postalCode: sanitizeString(payload.postalCode, base.postalCode ?? ''),
    city: sanitizeString(payload.city, base.city ?? ''),
    country: sanitizeString(payload.country, base.country ?? ''),
    email: sanitizeString(payload.email, base.email ?? ''),
    phone: sanitizeString(payload.phone, base.phone ?? ''),
    website: sanitizeString(payload.website, base.website ?? ''),
    logoUrl: sanitizeString(payload.logoUrl, base.logoUrl ?? ''),
    primaryColor: sanitizeString(payload.primaryColor, base.primaryColor ?? DEFAULT_SETTINGS.primaryColor),
    documentPrefix,
    defaultPaymentTerms: sanitizeString(payload.defaultPaymentTerms, base.defaultPaymentTerms ?? ''),
    disclaimer: sanitizeString(payload.disclaimer, base.disclaimer ?? ''),
    iban: sanitizeString(payload.iban, base.iban ?? ''),
    vatId: sanitizeString(payload.vatId, base.vatId ?? ''),
    directorName: sanitizeString(payload.directorName, base.directorName ?? ''),
    notes,
    noteDefaultsByDoc: noteDefaults,
    documentNumbering: normalizeDocumentNumbering(payload.documentNumbering, base, documentPrefix),
    offerClauses: [],
  };
}

function removeInternalFields<T extends { key?: unknown; _id?: unknown; __v?: unknown }>(document: T): Settings {
  const { key: _key, __v: _version, _id: _id, ...rest } = document as unknown as Settings &
    Record<string, unknown>;
  return sanitizeSettings(rest as SettingsUpdate, DEFAULT_SETTINGS);
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
  // prevent conflicting updates: legacy offerClauses are converted into notes above,
  // so we ensure Mongo never receives a $set on offerClauses while also $unset-ing it.
  if ('offerClauses' in next) {
    delete (next as Partial<Settings>).offerClauses;
  }
  const updated = await SettingsModel.findOneAndUpdate(
    { key: 'global' },
    { $set: next, $unset: { offerClauses: '' } },
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
