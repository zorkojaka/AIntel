import { ApiEnvelope, DocumentPrefixKey, SettingsDto } from './types';
import type { RequirementTemplateGroup, RequirementTemplateVariant, OfferGenerationRule } from '@aintel/shared/types/project';

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
