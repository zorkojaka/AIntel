export function getTenantId() {
  return import.meta.env.VITE_TENANT_ID ?? 'inteligent';
}
