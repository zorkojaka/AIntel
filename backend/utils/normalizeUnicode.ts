export function normalizeUnicode(obj: any, seen = new WeakMap()) {
  if (typeof obj === 'string') return obj.normalize('NFC');
  if (obj && typeof obj === 'object') {
    if (seen.has(obj)) return seen.get(obj);
    const copy = Array.isArray(obj) ? [] : {};
    seen.set(obj, copy);
    for (const key in obj) copy[key] = normalizeUnicode(obj[key], seen);
    return copy;
  }
  return obj;
}
