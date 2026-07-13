// AIN-P2-11: register imenskih prostorov config store. Vsak modul registrira svoj
// prostor s shemo (validator) + opisom; storitev in API uporabljata samo register.
import type { Validator } from './config-validator';

export class ConfigNamespaceNotFoundError extends Error {
  statusCode = 404;
  constructor(namespace: string) {
    super(`Neznan imenski prostor "${namespace}".`);
    this.name = 'ConfigNamespaceNotFoundError';
  }
}

export interface ConfigNamespaceDefinition<T = Record<string, unknown>> {
  // Imenski prostor v obliki `config.<modul>.<kljuc>`, npr. `platform.general`.
  namespace: string;
  // Shema (zod-like validator), ki validira in doda privzete vrednosti.
  schema: Validator<T>;
  // Kratek SI opis za admin UI.
  description: string;
}

const registry = new Map<string, ConfigNamespaceDefinition>();

const NAMESPACE_RE = /^[a-z0-9]+(?:\.[a-z0-9]+)+$/;

export function registerConfigNamespace<T extends Record<string, unknown>>(
  def: ConfigNamespaceDefinition<T>,
): void {
  if (!NAMESPACE_RE.test(def.namespace)) {
    throw new Error(`Neveljaven imenski prostor "${def.namespace}" (pričakovano npr. modul.kljuc).`);
  }
  if (registry.has(def.namespace)) {
    throw new Error(`Imenski prostor "${def.namespace}" je že registriran.`);
  }
  registry.set(def.namespace, def as ConfigNamespaceDefinition);
}

export function getConfigNamespace(namespace: string): ConfigNamespaceDefinition {
  const def = registry.get(namespace);
  if (!def) throw new ConfigNamespaceNotFoundError(namespace);
  return def;
}

export function hasConfigNamespace(namespace: string): boolean {
  return registry.has(namespace);
}

export function listConfigNamespaces(): ConfigNamespaceDefinition[] {
  return [...registry.values()].sort((a, b) => a.namespace.localeCompare(b.namespace));
}

// Samo za teste — počisti register med testnimi primeri.
export function _resetConfigRegistry(): void {
  registry.clear();
}
