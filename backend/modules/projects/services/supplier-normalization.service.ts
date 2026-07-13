export const MISSING_SUPPLIER_KEY = 'brez-dobavitelja';

function normalizePart(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeSupplierKey(supplier: unknown, address?: unknown) {
  const raw = [normalizePart(supplier), normalizePart(address)].filter(Boolean).join(' ');
  if (!raw) return MISSING_SUPPLIER_KEY;
  const key = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return key || MISSING_SUPPLIER_KEY;
}

export function normalizeSupplierFields<T extends { dobavitelj?: unknown; naslovDobavitelja?: unknown }>(item: T) {
  return {
    ...item,
    supplierKey: normalizeSupplierKey(item.dobavitelj, item.naslovDobavitelja),
  };
}
