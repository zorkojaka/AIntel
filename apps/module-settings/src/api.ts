import {
  ApiEnvelope,
  DocumentPrefixKey,
  DocumentTypeKey,
  NoteDto,
  NotesDefaultsByDoc,
  OfferPdfPreviewPayload,
  PdfCompanySettingsDto,
  PdfDocumentSettingsDto,
  SettingsDto,
} from './types';
import type { RequirementTemplateGroup, RequirementTemplateVariant, OfferGenerationRule } from '@aintel/shared/types/project';

const DOCUMENT_TYPE_KEYS: DocumentTypeKey[] = [
  'offer',
  'invoice',
  'workOrder',
  'materialOrder',
  'deliveryNote',
  'workOrderConfirmation',
  'creditNote',
];

function createEmptyNoteDefaults(): NotesDefaultsByDoc {
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

function normalizeNotesList(notes?: NoteDto[]): NoteDto[] {
  if (!Array.isArray(notes)) {
    return [];
  }

  return notes
    .map((note, index) => ({
      ...note,
      sortOrder: typeof note.sortOrder === 'number' && Number.isFinite(note.sortOrder) ? note.sortOrder : index,
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((note, index) => ({ ...note, sortOrder: index }));
}

function mergeNoteDefaults(partial: NotesDefaultsByDoc | undefined, notes: NoteDto[]): NotesDefaultsByDoc {
  const base = createEmptyNoteDefaults();
  const order = notes.map((note) => note.id);
  const orderMap = new Map(order.map((id, index) => [id, index]));

  DOCUMENT_TYPE_KEYS.forEach((key) => {
    const raw = partial?.[key];
    if (!Array.isArray(raw)) {
      base[key] = [];
      return;
    }
    const seen = new Set<string>();
    base[key] = raw
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value && orderMap.has(value) && !seen.has(value) && seen.add(value))
      .sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
  });

  return base;
}

export const DEFAULT_SETTINGS: SettingsDto = {
  companyName: 'Vase podjetje d.o.o.',
  address: 'Glavna cesta 1',
  postalCode: '1000',
  city: 'Ljubljana',
  country: 'Slovenija',
  email: 'info@vasepodjetje.si',
  phone: '+386 1 123 45 67',
  website: 'https://www.vasepodjetje.si',
  logoUrl: '',
  primaryColor: '#0f62fe',
  documentPrefix: {
    offer: 'PON-',
    invoice: 'RAC-',
    order: 'NOR-',
    deliveryNote: 'DOB-',
    workOrder: 'DEL-',
  },
  iban: 'SI56 0201 2003 4567 890',
  vatId: 'SI12345678',
  directorName: 'Janez Novak',
  notes: [],
  noteDefaultsByDoc: createEmptyNoteDefaults(),
  defaultPaymentTerms: '',
  disclaimer: '',
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

  const notes = normalizeNotesList(partial?.notes ?? DEFAULT_SETTINGS.notes);
  const noteDefaults = mergeNoteDefaults(partial?.noteDefaultsByDoc, notes);

  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    documentPrefix,
    notes,
    noteDefaultsByDoc: noteDefaults,
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

export async function fetchPdfCompanySettings(): Promise<PdfCompanySettingsDto> {
  const response = await fetch('/api/settings/company');
  return parseEnvelope<PdfCompanySettingsDto>(response);
}

export async function savePdfCompanySettings(payload: PdfCompanySettingsDto): Promise<PdfCompanySettingsDto> {
  const response = await fetch('/api/settings/company', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseEnvelope<PdfCompanySettingsDto>(response);
}

export async function fetchPdfDocumentSettings(docType: string = 'OFFER'): Promise<PdfDocumentSettingsDto> {
  const params = new URLSearchParams({ docType });
  const response = await fetch(`/api/settings/pdf-documents?${params.toString()}`);
  return parseEnvelope<PdfDocumentSettingsDto>(response);
}

export async function savePdfDocumentSettings(
  docType: string,
  payload: Partial<PdfDocumentSettingsDto>,
): Promise<PdfDocumentSettingsDto> {
  const params = new URLSearchParams({ docType });
  const response = await fetch(`/api/settings/pdf-documents?${params.toString()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseEnvelope<PdfDocumentSettingsDto>(response);
}

export async function fetchOfferPdfPreview(offerVersionId: string, options?: { allowDemo?: boolean; docType?: string }) {
  const params = new URLSearchParams();
  if (options?.docType) params.set('docType', options.docType);
  if (options?.allowDemo) params.set('allowDemo', '1');
  if (!options?.allowDemo) params.set('fallback', 'demo');
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/offers/${offerVersionId}/pdf-preview${query}`);
  return parseEnvelope<OfferPdfPreviewPayload>(response);
}

export async function fetchRequirementTemplates(
  categorySlug?: string
): Promise<RequirementTemplateGroup[]> {
  const query = categorySlug ? `?categorySlug=${encodeURIComponent(categorySlug)}` : '';
  const response = await fetch(`/api/requirement-templates${query}`);
  return parseEnvelope<RequirementTemplateGroup[]>(response);
}

export async function createRequirementTemplateGroup(
  payload: Omit<RequirementTemplateGroup, 'id'>
): Promise<RequirementTemplateGroup> {
  const response = await fetch('/api/requirement-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseEnvelope<RequirementTemplateGroup>(response);
}

export async function updateRequirementTemplateGroup(
  id: string,
  payload: Omit<RequirementTemplateGroup, 'id'>
): Promise<RequirementTemplateGroup> {
  const response = await fetch(`/api/requirement-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseEnvelope<RequirementTemplateGroup>(response);
}

export async function deleteRequirementTemplateGroup(id: string): Promise<void> {
  const response = await fetch(`/api/requirement-templates/${id}`, {
    method: 'DELETE'
  });
  await parseEnvelope(response);
}

export async function fetchRequirementVariants(
  categorySlug?: string
): Promise<RequirementTemplateVariant[]> {
  const query = categorySlug ? `?categorySlug=${encodeURIComponent(categorySlug)}` : '';
  const response = await fetch(`/api/requirement-templates/variants${query}`);
  return parseEnvelope<RequirementTemplateVariant[]>(response);
}

export async function fetchOfferRules(params?: {
  category?: string;
  variant?: string;
}): Promise<OfferGenerationRule[]> {
  const search = new URLSearchParams();
  if (params?.category) search.set('category', params.category);
  if (params?.variant) search.set('variant', params.variant);
  const query = search.toString() ? `?${search.toString()}` : '';
  const response = await fetch(`/api/requirement-templates/offer-rules${query}`);
  return parseEnvelope<OfferGenerationRule[]>(response);
}

export async function createOfferRule(
  payload: Omit<OfferGenerationRule, 'id'>
): Promise<OfferGenerationRule> {
  const response = await fetch('/api/requirement-templates/offer-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseEnvelope<OfferGenerationRule>(response);
}

export async function updateOfferRule(
  id: string,
  payload: Omit<OfferGenerationRule, 'id'>
): Promise<OfferGenerationRule> {
  const response = await fetch(`/api/requirement-templates/offer-rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseEnvelope<OfferGenerationRule>(response);
}

export async function deleteOfferRule(id: string): Promise<void> {
  const response = await fetch(`/api/requirement-templates/offer-rules/${id}`, {
    method: 'DELETE'
  });
  await parseEnvelope(response);
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
