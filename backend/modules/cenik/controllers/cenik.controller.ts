import { Request, Response } from 'express';
import { ProductDocument, ProductModel } from '../product.model';

type ProductPayload = Pick<
  ProductDocument,
  | 'ime'
  | 'kategorija'
  | 'categorySlug'
  | 'categorySlugs'
  | 'isService'
  | 'categories'
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
  const kategorija = castText(body.kategorija);
  const categorySlugs = normalizeCategorySlugs(body.categorySlugs ?? body.categories);
  const fallbackSlug = categorySlugs[0] || normalizeSlug(body.categorySlug ?? kategorija);
  const fallbackName = kategorija || (categorySlugs[0] ? categorySlugs[0].replace(/-/g, ' ') : '');
  const isService = parseBoolean(body.isService);
  const resolvedSlugs = categorySlugs.length ? categorySlugs : fallbackSlug ? [fallbackSlug] : [];
  return {
    ime: castText(body.ime),
    kategorija: fallbackName,
    categorySlug: fallbackSlug,
    categorySlugs: resolvedSlugs,
    isService,
    nabavnaCena: parsePrice(body.nabavnaCena),
    prodajnaCena: parsePrice(body.prodajnaCena),
    kratekOpis: castText(body.kratekOpis),
    dolgOpis: castText(body.dolgOpis),
    povezavaDoSlike: castText(body.povezavaDoSlike),
    proizvajalec: castText(body.proizvajalec),
    dobavitelj: castText(body.dobavitelj),
    povezavaDoProdukta: castText(body.povezavaDoProdukta),
    naslovDobavitelja: castText(body.naslovDobavitelja),
    casovnaNorma: castText(body.casovnaNorma),
    categories: resolvedSlugs
  };
}

function sortBySuggested(products: ProductDocument[], suggested: string[]) {
  if (!suggested.length) {
    return products;
  }
  const matchSet = new Set(suggested);
  return products.sort((a, b) => {
    const aMatch = a.categorySlug && matchSet.has(a.categorySlug) ? 0 : 1;
    const bMatch = b.categorySlug && matchSet.has(b.categorySlug) ? 0 : 1;
    if (aMatch !== bMatch) {
      return aMatch - bMatch;
    }
    return 0;
  });
}

export async function getAllProducts(_req: Request, res: Response) {
  try {
    const products = await ProductModel.find().lean();
    const query = _req.query?.suggestForCategories;
    if (!query) {
      return res.success(products);
    }

    const requested = String(query)
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const sorted = sortBySuggested(products, requested);
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
    res.success(product);
  } catch (error) {
    res.fail('Napaka pri iskanju produkta');
  }
}

export async function createProduct(req: Request, res: Response) {
  try {
    const payload = buildPayload(req.body);
    if (!payload.ime || !payload.kategorija) {
      return res.fail('Ime in kategorija sta obvezni', 400);
    }
    const created = await ProductModel.create(payload);
    res.success(created, 201);
  } catch (error) {
    res.fail('Napaka pri dodajanju produkta');
  }
}

export async function updateProduct(req: Request, res: Response) {
  try {
    const payload = buildPayload(req.body);
    const updated = await ProductModel.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!updated) {
      return res.fail('Produkt ne obstaja', 404);
    }
    res.success(updated);
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
