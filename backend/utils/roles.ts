export const ROLE_ADMIN = 'ADMIN';
export const ROLE_SALES = 'SALES';
export const ROLE_EXECUTION = 'EXECUTION';
export const ROLE_FINANCE = 'FINANCE';

export const ROLE_VALUES = [ROLE_ADMIN, ROLE_SALES, ROLE_EXECUTION, ROLE_FINANCE] as const;

const ROLE_ALIAS_MAP: Record<string, string> = {
  admin: ROLE_ADMIN,
  sales: ROLE_SALES,
  finance: ROLE_FINANCE,
  execution: ROLE_EXECUTION,
  technician: ROLE_EXECUTION,
  ops: ROLE_EXECUTION,
  manager: ROLE_EXECUTION,
};

export function toCanonicalRole(role: string): string | null {
  const trimmed = role.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (ROLE_VALUES.includes(upper as (typeof ROLE_VALUES)[number])) {
    return upper;
  }
  const alias = ROLE_ALIAS_MAP[trimmed.toLowerCase()];
  return alias ?? null;
}

export function normalizeRoleList(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const mapped: string[] = [];
  for (const role of input) {
    const canonical = typeof role === 'string' ? toCanonicalRole(role) : null;
    if (!canonical) {
      return null;
    }
    if (!mapped.includes(canonical)) {
      mapped.push(canonical);
    }
  }
  return mapped;
}
