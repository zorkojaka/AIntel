import { ProductModel } from '../cenik/product.model';
import { MaterialOrderModel } from '../projects/schemas/material-order';
import { normalizeSupplierKey, MISSING_SUPPLIER_KEY } from '../projects/services/supplier-normalization.service';
import { SupplierSettingsModel, type SupplierEmailEntry } from './supplier-settings.model';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface SupplierListEntry {
  key: string;
  name: string;
  emails: SupplierEmailEntry[];
}

/**
 * Očisti seznam e-naslovov dobavitelja: veljaven format, brez dvojnikov,
 * natanko en privzeti (če ni izbran ali jih je več, obvelja prvi).
 */
export function sanitizeSupplierEmails(input: unknown): SupplierEmailEntry[] {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const emails: SupplierEmailEntry[] = [];
  for (const entry of list) {
    const address = String((entry as any)?.address ?? '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(address) || seen.has(address)) continue;
    seen.add(address);
    emails.push({ address, isDefault: (entry as any)?.isDefault === true });
  }
  const defaults = emails.filter((entry) => entry.isDefault);
  if (emails.length > 0 && defaults.length !== 1) {
    emails.forEach((entry, index) => {
      entry.isDefault = defaults.length === 0 ? index === 0 : entry.address === defaults[0].address;
    });
  }
  return emails;
}

/**
 * Združen seznam dobaviteljev: imena iz cenika + iz obstoječih naročil
 * materiala + shranjene nastavitve (e-naslovi). Ključ je normalizirano ime.
 */
export async function listSuppliers(): Promise<SupplierListEntry[]> {
  const [productSuppliers, orderSuppliers, settings] = await Promise.all([
    ProductModel.distinct('dobavitelj'),
    MaterialOrderModel.distinct('items.dobavitelj'),
    SupplierSettingsModel.find().lean(),
  ]);

  const byKey = new Map<string, SupplierListEntry>();
  for (const raw of [...productSuppliers, ...orderSuppliers]) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name) continue;
    const key = normalizeSupplierKey(name);
    if (key === MISSING_SUPPLIER_KEY || byKey.has(key)) continue;
    byKey.set(key, { key, name, emails: [] });
  }
  for (const doc of settings) {
    const existing = byKey.get(doc.key);
    if (existing) {
      existing.emails = doc.emails ?? [];
      if (doc.name?.trim()) existing.name = doc.name.trim();
    } else if (doc.key !== MISSING_SUPPLIER_KEY) {
      byKey.set(doc.key, { key: doc.key, name: doc.name, emails: doc.emails ?? [] });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, 'sl-SI'));
}

export async function upsertSupplierEmails(key: string, name: string, emailsInput: unknown): Promise<SupplierListEntry> {
  const cleanKey = key.trim();
  const cleanName = name.trim();
  if (!cleanKey || cleanKey === MISSING_SUPPLIER_KEY) {
    throw new Error('Dobavitelj ni pravilno določen.');
  }
  const emails = sanitizeSupplierEmails(emailsInput);
  const doc = await SupplierSettingsModel.findOneAndUpdate(
    { key: cleanKey },
    { $set: { name: cleanName || cleanKey, emails } },
    { new: true, upsert: true },
  ).lean();
  return { key: doc.key, name: doc.name, emails: doc.emails ?? [] };
}
