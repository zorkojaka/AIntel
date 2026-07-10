// AIN-P2-11: config store storitev — branje/pisanje po imenskem prostoru, tenant-scoped,
// validirano prek registrirane sheme, s procesnim cacheom + invalidacijo ob pisanju.
import { ConfigStoreModel } from './config-store.model';
import { getConfigNamespace, listConfigNamespaces } from './config-registry';

const DEFAULT_TENANT = 'inteligent';
const cache = new Map<string, Record<string, unknown>>();

function cacheKey(tenantId: string, namespace: string): string {
  return `${tenantId}::${namespace}`;
}

// Vrne validirano konfiguracijo prostora (shranjena vrednost prek sheme; manjkajoča
// polja dobijo privzete vrednosti). Nikoli ne vrže zaradi manjkajoče vrstice v bazi.
export async function getConfig<T extends Record<string, unknown> = Record<string, unknown>>(
  namespace: string,
  tenantId: string = DEFAULT_TENANT,
): Promise<T> {
  const key = cacheKey(tenantId, namespace);
  const cached = cache.get(key);
  if (cached) return cached as T;

  const def = getConfigNamespace(namespace);
  const doc = await ConfigStoreModel.findOne({ tenantId, namespace }).lean();
  // Shema doda privzete vrednosti tudi za prazen/manjkajoč zapis.
  const value = def.schema.parse(doc?.value ?? {}) as T;
  cache.set(key, value);
  return value;
}

// Popolna zamenjava konfiguracije prostora (validirano). updatedBy = actorEmployeeId/userId.
export async function setConfig<T extends Record<string, unknown> = Record<string, unknown>>(
  namespace: string,
  value: unknown,
  { tenantId = DEFAULT_TENANT, updatedBy = null }: { tenantId?: string; updatedBy?: string | null } = {},
): Promise<T> {
  const def = getConfigNamespace(namespace);
  const validated = def.schema.parse(value ?? {}) as T;
  await ConfigStoreModel.updateOne(
    { tenantId, namespace },
    { $set: { value: validated, updatedBy }, $setOnInsert: { tenantId, namespace } },
    { upsert: true },
  );
  cache.set(cacheKey(tenantId, namespace), validated);
  return validated;
}

// Delna posodobitev (plitvo spajanje na vrhnjem nivoju prostora), nato validacija.
export async function patchConfig<T extends Record<string, unknown> = Record<string, unknown>>(
  namespace: string,
  partial: Record<string, unknown>,
  opts: { tenantId?: string; updatedBy?: string | null } = {},
): Promise<T> {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT;
  const current = await getConfig<Record<string, unknown>>(namespace, tenantId);
  return setConfig<T>(namespace, { ...current, ...partial }, { tenantId, updatedBy: opts.updatedBy ?? null });
}

// Metapodatki vseh registriranih prostorov + trenutne vrednosti (za admin UI).
export async function listConfig(tenantId: string = DEFAULT_TENANT) {
  const defs = listConfigNamespaces();
  const values = await Promise.all(defs.map((def) => getConfig(def.namespace, tenantId)));
  return defs.map((def, i) => ({ namespace: def.namespace, description: def.description, value: values[i] }));
}

export function invalidateConfig(namespace: string, tenantId: string = DEFAULT_TENANT): void {
  cache.delete(cacheKey(tenantId, namespace));
}

// Samo za teste.
export function _clearConfigCache(): void {
  cache.clear();
}
