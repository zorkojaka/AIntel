import { Request, Response } from 'express';
import { ProductDocument, ProductModel } from '../product.model';
import type { PriceListSearchItem } from '../../../../shared/types/price-list';

type ProductPayload = Pick<
  ProductDocument,
  | 'ime'
  | 'categorySlugs'
  | 'isService'
  | 'nabavnaCena'
  | 'prodajnaCena'
  | 'kratekOpis'
  | 'dolgOpis'
  | 'povezavaDoSlike'
  | 'proizvajalec'
  | 'dobavitelj'
  | 'povezavaDoProdukta'
  | 'naslovDobavitelja'
  | 'casovnaNorma'
>;

type ProductResponse = ProductPayload & {
  _id: ProductDocument['_id'];
  createdAt: Date;
  updatedAt: Date;
};

const parsePrice = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

const castText = (value: unknown) => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
};

const parseBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'da';
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return fallback;
};

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCategorySlugs(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const normalized = input
    .map((value) => (typeof value === 'string' ? normalizeSlug(value) : ''))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function buildPayload(body: Partial<ProductPayload>): ProductPayload {
  return {
    ime: castText(body.ime),
    categorySlugs: normalizeCategorySlugs(body.categorySlugs),
    isService: parseBoolean(body.isService),
    nabavnaCena: parsePrice(body.nabavnaCena),
    prodajnaCena: parsePrice(body.prodajnaCena),
    kratekOpis: castText(body.kratekOpis),
    dolgOpis: castText(body.dolgOpis),
    povezavaDoSlike: castText(body.povezavaDoSlike),
    proizvajalec: castText(body.proizvajalec),
    dobavitelj: castText(body.dobavitelj),
    povezavaDoProdukta: castText(body.povezavaDoProdukta),
    naslovDobavitelja: castText(body.naslovDobavitelja),
    casovnaNorma: castText(body.casovnaNorma)
  };
}

function sanitizeProduct(product: ProductDocument): ProductResponse {
  return {
    _id: product._id,
    ime: product.ime,
    categorySlugs: product.categorySlugs ?? [],
    isService: product.isService,
    nabavnaCena: product.nabavnaCena,
    prodajnaCena: product.prodajnaCena,
    kratekOpis: product.kratekOpis ?? '',
    dolgOpis: product.dolgOpis ?? '',
    povezavaDoSlike: product.povezavaDoSlike ?? '',
    proizvajalec: product.proizvajalec ?? '',
    dobavitelj: product.dobavitelj ?? '',
    povezavaDoProdukta: product.povezavaDoProdukta ?? '',
    naslovDobavitelja: product.naslovDobavitelja ?? '',
    casovnaNorma: product.casovnaNorma ?? '',
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function sortBySuggested(products: ProductResponse[], suggested: string[]) {
  if (!suggested.length) {
    return products;
  }
  const matchSet = new Set(suggested);
  return products.sort((a, b) => {
    const aMatch = a.categorySlugs.some((slug) => matchSet.has(slug)) ? 0 : 1;
    const bMatch = b.categorySlugs.some((slug) => matchSet.has(slug)) ? 0 : 1;
    if (aMatch !== bMatch) {
      return aMatch - bMatch;
    }
    return 0;
  });
}

export async function getAllProducts(_req: Request, res: Response) {
  try {
    const products = await ProductModel.find().lean();
    const sanitized = products.map((product) => sanitizeProduct(product));
    const query = _req.query?.suggestForCategories;
    if (!query) {
      return res.success(sanitized);
    }

    const requested = String(query)
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const sorted = sortBySuggested(sanitized, requested);
    res.success(sorted);
  } catch (error) {
    res.fail('Ne morem pridobiti cenika');
  }
}

export async function getProductById(req: Request, res: Response) {
  try {
    const product = await ProductModel.findById(req.params.id).lean();
    if (!product) {
      return res.fail('Produkt ne obstaja', 404);
    }
    res.success(sanitizeProduct(product));
  } catch (error) {
    res.fail('Napaka pri iskanju produkta');
  }
}

export async function createProduct(req: Request, res: Response) {
  try {
    const payload = buildPayload(req.body);
    if (!payload.ime || !payload.categorySlugs.length) {
      return res.fail('Ime in vsaj ena kategorija sta obvezni', 400);
    }
    const created = await ProductModel.create(payload);
    res.success(sanitizeProduct(created), 201);
  } catch (error) {
    res.fail('Napaka pri dodajanju produkta');
  }
}

export async function updateProduct(req: Request, res: Response) {
  try {
    const payload = buildPayload(req.body);
    const updatePayload: Partial<ProductPayload> = { ...payload };
    if (req.body.categorySlugs === undefined) {
      delete updatePayload.categorySlugs;
    }
    const updated = await ProductModel.findByIdAndUpdate(req.params.id, updatePayload, { new: true }).lean();
    if (!updated) {
      return res.fail('Produkt ne obstaja', 404);
    }
    res.success(sanitizeProduct(updated));
  } catch (error) {
    res.fail('Napaka pri posodabljanju produkta');
  }
}

export async function deleteProduct(req: Request, res: Response) {
  try {
    const deleted = await ProductModel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.fail('Produkt ne obstaja', 404);
    }
    res.success({ message: 'Produkt izbrisan' });
  } catch (error) {
    res.fail('Napaka pri brisanju produkta');
  }
}

export async function searchPriceListItems(req: Request, res: Response) {
  const q = (req.query?.q ?? '').toString().trim();
  const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 5));
  if (!q) {
    return res.success([] as PriceListSearchItem[]);
  }

  try {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const products = await ProductModel.find({
      $or: [{ ime: regex }, { kategorija: regex }],
    })
      .sort({ ime: 1 })
      .limit(limit)
      .lean();

    const mapped: PriceListSearchItem[] = products.map((product) => ({
      id: product._id.toString(),
      name: product.ime,
      code: product.kategorija ?? undefined,
      unit: product.isService ? 'ura' : 'kos',
      unitPrice: Number(product.prodajnaCena ?? 0),
      vatRate: 22,
    }));

    res.success(mapped);
  } catch (_error) {
    res.fail('Napaka pri iskanju po ceniku');
  }
}
