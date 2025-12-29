export function getTenantId() {
  return import.meta.env.VITE_TENANT_ID ?? 'inteligent';
}

export function buildTenantHeaders(extra?: Record<string, string>) {
  return {
    'x-tenant-id': getTenantId(),
    ...(extra ?? {}),
  } as Record<string, string>;
}
