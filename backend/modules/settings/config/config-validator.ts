// AIN-P2-11: config store — lahek, brez zunanjih odvisnosti validator, ki posnema
// zod-ov `.parse()` pogodbeni vmesnik. Ko bo `zod` odobren kot paket (glej
// projektno konvencijo: nova paketa čakata lastnikov OK), se namespace sheme
// prepišejo 1:1 v zod, storitev pa ostane nespremenjena (kliče samo `.parse`).

export class ConfigValidationError extends Error {
  statusCode = 400;
  path: string;
  constructor(message: string, path = '') {
    super(path ? `${path}: ${message}` : message);
    this.name = 'ConfigValidationError';
    this.path = path;
  }
}

export interface Validator<T> {
  parse(input: unknown, path?: string): T;
  optional(): Validator<T | undefined>;
  default(value: T): Validator<T>;
}

type ParseFn<T> = (input: unknown, path: string) => T;

class V<T> implements Validator<T> {
  constructor(private readonly fn: ParseFn<T>, private readonly _default?: T, private readonly _optional = false) {}

  parse(input: unknown, path = ''): T {
    if (input === undefined || input === null) {
      if (this._default !== undefined) return clone(this._default);
      if (this._optional) return undefined as unknown as T;
      if (input === null) throw new ConfigValidationError('vrednost ne sme biti null', path);
      throw new ConfigValidationError('vrednost je obvezna', path);
    }
    return this.fn(input, path);
  }

  optional(): Validator<T | undefined> {
    return new V<T | undefined>(this.fn as ParseFn<T | undefined>, this._default, true);
  }

  default(value: T): Validator<T> {
    return new V<T>(this.fn, value, this._optional);
  }
}

function clone<T>(value: T): T {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

export type Infer<Val> = Val extends Validator<infer T> ? T : never;
type Shape = Record<string, Validator<unknown>>;

export const v = {
  string(opts: { min?: number; max?: number; trim?: boolean; lowercase?: boolean } = {}): Validator<string> {
    return new V<string>((input, path) => {
      if (typeof input !== 'string') throw new ConfigValidationError('pričakovan niz', path);
      let out = opts.trim === false ? input : input.trim();
      if (opts.lowercase) out = out.toLowerCase();
      if (opts.min !== undefined && out.length < opts.min) throw new ConfigValidationError(`najmanj ${opts.min} znakov`, path);
      if (opts.max !== undefined && out.length > opts.max) throw new ConfigValidationError(`največ ${opts.max} znakov`, path);
      return out;
    });
  },

  number(opts: { min?: number; max?: number; int?: boolean } = {}): Validator<number> {
    return new V<number>((input, path) => {
      const num = typeof input === 'string' && input.trim() !== '' ? Number(input) : input;
      if (typeof num !== 'number' || !Number.isFinite(num)) throw new ConfigValidationError('pričakovano število', path);
      if (opts.int && !Number.isInteger(num)) throw new ConfigValidationError('pričakovano celo število', path);
      if (opts.min !== undefined && num < opts.min) throw new ConfigValidationError(`najmanj ${opts.min}`, path);
      if (opts.max !== undefined && num > opts.max) throw new ConfigValidationError(`največ ${opts.max}`, path);
      return num;
    });
  },

  boolean(): Validator<boolean> {
    return new V<boolean>((input, path) => {
      if (typeof input === 'boolean') return input;
      if (input === 'true') return true;
      if (input === 'false') return false;
      throw new ConfigValidationError('pričakovana logična vrednost', path);
    });
  },

  enum<E extends string>(values: readonly E[]): Validator<E> {
    return new V<E>((input, path) => {
      if (typeof input !== 'string' || !values.includes(input as E)) {
        throw new ConfigValidationError(`dovoljene vrednosti: ${values.join(', ')}`, path);
      }
      return input as E;
    });
  },

  array<T>(inner: Validator<T>, opts: { min?: number; max?: number } = {}): Validator<T[]> {
    return new V<T[]>((input, path) => {
      if (!Array.isArray(input)) throw new ConfigValidationError('pričakovan seznam', path);
      if (opts.min !== undefined && input.length < opts.min) throw new ConfigValidationError(`najmanj ${opts.min} elementov`, path);
      if (opts.max !== undefined && input.length > opts.max) throw new ConfigValidationError(`največ ${opts.max} elementov`, path);
      return input.map((item, i) => inner.parse(item, `${path}[${i}]`));
    });
  },

  object<S extends Shape>(shape: S): Validator<{ [K in keyof S]: Infer<S[K]> }> {
    return new V((input, path) => {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new ConfigValidationError('pričakovan objekt', path);
      }
      const src = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        const childPath = path ? `${path}.${key}` : key;
        out[key] = shape[key].parse(src[key], childPath);
      }
      return out as { [K in keyof S]: Infer<S[K]> };
    });
  },
};
