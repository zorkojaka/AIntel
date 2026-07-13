import { Request, Response } from 'express';
import { ProductDocument, ProductModel } from '../product.model';
import type { PriceListSearchItem } from '../../../../shared/types/price-list';
import { precheckProductCandidate } from '../services/product-sync.service';
import { buildCategoryPriorityMap, resolvePriorityFromProductMap } from '../services/category-settings.service';
import {
  applyCategoryMarginSellingPrice,
  loadCategoryMarginSettings,
  resolveCategoryMarginPricingInfo,
  type CategoryMarginPricingInfo,
} from '../services/category-margin-pricing';
import { applyReolinkImageOverride } from '../services/reolink-image-overrides';

type ProductPayload = Pick<
  ProductDocument,
  | 'ime'
  | 'categorySlugs'
  | 'isService'
  | 'purchasePriceWithoutVat'
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
  | 'defaultExecutionMode'
  | 'defaultInstructionsTemplate'
>;

type ProductResponse = ProductPayload & {
  _id: ProductDocument['_id'];
  externalSource?: string;
  externalId?: string;
  externalKey?: string;
  isActive?: boolean;
  aaData?: ProductDocument['aaData'];
  classification?: ProductDocument['classification'];
  categoryPriority?: 1 | 2 | 3 | null;
  pricingRule?: CategoryMarginPricingInfo | null;
  status?: string;
  mergedIntoProductId?: string;
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

const parseExecutionMode = (value: unknown): ProductDocument['defaultExecutionMode'] => {
  if (value === 'simple' || value === 'per_unit' || value === 'measured') {
    return value;
  }
  return undefined;
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

async function buildPayload(body: Partial<ProductPayload>): Promise<ProductPayload> {
  return applyReolinkImageOverride(await applyCategoryMarginSellingPrice({
    ime: castText(body.ime),
    categorySlugs: normalizeCategorySlugs(body.categorySlugs),
    isService: parseBoolean(body.isService),
    purchasePriceWithoutVat: parsePrice(body.purchasePriceWithoutVat ?? body.nabavnaCena),
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
    defaultExecutionMode: parseExecutionMode(body.defaultExecutionMode),
    defaultInstructionsTemplate: castText(body.defaultInstructionsTemplate),
  }));
}

function sanitizeProduct(
  product: ProductDocument,
  categoryPriority?: 1 | 2 | 3 | null,
  marginSettings: Awaited<ReturnType<typeof loadCategoryMarginSettings>> = [],
): ProductResponse {
  const pricingRule = resolveCategoryMarginPricingInfo(product as any, marginSettings);
  return applyReolinkImageOverride({
    _id: product._id,
    externalSource: product.externalSource ?? '',
    externalId: product.externalId ?? '',
    externalKey: product.externalKey ?? '',
    ime: product.ime,
    categorySlugs: product.categorySlugs ?? [],
    isService: product.isService,
    purchasePriceWithoutVat: product.purchasePriceWithoutVat ?? product.nabavnaCena,
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
    defaultExecutionMode: product.defaultExecutionMode,
    defaultInstructionsTemplate: product.defaultInstructionsTemplate ?? '',
    isActive: product.isActive !== false,
    aaData: product.aaData,
    classification: product.classification,
    categoryPriority: categoryPriority ?? null,
    pricingRule,
    status: product.status ?? (product.isActive === false ? 'merged' : 'active'),
    mergedIntoProductId: product.mergedIntoProductId ? String(product.mergedIntoProductId) : '',
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  });
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
    const includeInactive = String(_req.query?.includeInactive ?? '').toLowerCase() === 'true';
    const isServiceQuery = _req.query?.isService;
    const hasIsServiceFilter = typeof isServiceQuery === 'string' && isServiceQuery.trim() !== '';
    const filter: Record<string, unknown> = includeInactive ? {} : { isActive: { $ne: false } };
    if (hasIsServiceFilter) {
      filter.isService = parseBoolean(isServiceQuery);
    }
    const products = await ProductModel.find(filter).lean();
    const categoryPriorityByPath = await buildCategoryPriorityMap();
    const marginSettings = await loadCategoryMarginSettings();
    const sanitized = products.map((product) => sanitizeProduct(
      product,
      resolvePriorityFromProductMap(categoryPriorityByPath, product as any),
      marginSettings,
    ));
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
    const marginSettings = await loadCategoryMarginSettings();
    res.success(sanitizeProduct(product, null, marginSettings));
  } catch (error) {
    res.fail('Napaka pri iskanju produkta');
  }
}

export async function createProduct(req: Request, res: Response) {
  try {
    const payload = await buildPayload(req.body);
    if (!payload.ime || !payload.categorySlugs.length) {
      return res.fail('Ime in vsaj ena kategorija sta obvezni', 400);
    }
    const allowDuplicateCreate = req.body?.allowDuplicateCreate === true;
    if (!allowDuplicateCreate) {
      const precheck = await precheckProductCandidate({
        ...payload,
        externalSource: castText((req.body as any)?.externalSource) || undefined,
        externalId: castText((req.body as any)?.externalId) || undefined,
        externalKey: castText((req.body as any)?.externalKey) || undefined,
      });
      if (precheck.status !== 'safe_create') {
        return res.status(409).json({
          success: false,
          data: precheck,
          error: 'Mozen duplikat produkta. Pred create preveri ujemanja.'
        });
      }
    }
    const created = await ProductModel.create(payload);
    const marginSettings = await loadCategoryMarginSettings();
    res.success(sanitizeProduct(created, null, marginSettings), 201);
  } catch (error) {
    res.fail('Napaka pri dodajanju produkta');
  }
}

export async function precheckCreateProduct(req: Request, res: Response) {
  try {
    const payload = await buildPayload(req.body);
    if (!payload.ime || !payload.categorySlugs.length) {
      return res.fail('Ime in vsaj ena kategorija sta obvezni', 400);
    }

    const result = await precheckProductCandidate({
      ...payload,
      externalSource: castText((req.body as any)?.externalSource) || undefined,
      externalId: castText((req.body as any)?.externalId) || undefined,
      externalKey: castText((req.body as any)?.externalKey) || undefined,
    });
    res.success(result);
  } catch (error) {
    res.fail(error instanceof Error ? error.message : 'Precheck ni uspel.', 400);
  }
}

export async function updateProduct(req: Request, res: Response) {
  try {
    const payload = await buildPayload(req.body);
    const updatePayload: Partial<ProductPayload> = { ...payload };
    if (req.body.categorySlugs === undefined) {
      delete updatePayload.categorySlugs;
    }
    const updated = await ProductModel.findByIdAndUpdate(req.params.id, updatePayload, { new: true }).lean();
    if (!updated) {
      return res.fail('Produkt ne obstaja', 404);
    }
    const marginSettings = await loadCategoryMarginSettings();
    res.success(sanitizeProduct(updated, null, marginSettings));
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
  const q = (req.query?.q ?? '').toString();
  const normalizedQuery = normalizeSearchValue(q);
  if (!normalizedQuery) {
    return res.success([] as PriceListSearchItem[]);
  }
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);

  try {
    const includeInactive = String(req.query?.includeInactive ?? '').toLowerCase() === 'true';
    const filter = includeInactive ? {} : { isActive: { $ne: false } };
    const products = await ProductModel.find(filter)
      .select({
        ime: 1,
        kategorija: 1,
        categorySlug: 1,
        categorySlugs: 1,
        categories: 1,
        prodajnaCena: 1,
        povezavaDoSlike: 1,
        isService: 1,
        externalSource: 1,
        externalKey: 1,
        externalId: 1,
        aaData: 1,
      })
      .lean();
    const categoryPriorityByPath = await buildCategoryPriorityMap();

    const matches = products
      .map((product) => {
        const name = castText(product.ime);
        const code = castText(product.kategorija ?? (product as any).code ?? product.externalId ?? '');
        const slug = castText((product as any).slug ?? product.categorySlug ?? product.externalKey ?? '');
        const slugsRaw = [
          ...((product as any).slugs ?? []),
          ...(product.categorySlugs ?? []),
          ...(product.categories ?? []),
        ].filter((value) => typeof value === 'string' && value.trim() !== '') as string[];

        const normalizedName = normalizeSearchValue(name);
        const normalizedCode = normalizeSearchValue(code);
        const normalizedSlug = normalizeSearchValue(slug);
        const normalizedSlugs = slugsRaw.map(normalizeSearchValue).filter(Boolean);
        const normalizedCategories = [
          ...(product.categories ?? []),
          ...(product.categorySlugs ?? []),
        ]
          .map(normalizeSearchValue)
          .filter(Boolean);

        const nameStarts = normalizedName.startsWith(normalizedQuery);
        const nameIncludes = !nameStarts && normalizedName.includes(normalizedQuery);
        const nameTokenIncludes =
          !nameStarts &&
          !nameIncludes &&
          queryTokens.length > 1 &&
          queryTokens.every((token) => normalizedName.includes(token));
        const slugStarts = [normalizedSlug, ...normalizedSlugs].some((value) =>
          value.startsWith(normalizedQuery),
        );
        const slugIncludes =
          !slugStarts &&
          [normalizedSlug, ...normalizedSlugs].some((value) => value.includes(normalizedQuery));
        const slugTokenIncludes =
          !slugStarts &&
          !slugIncludes &&
          queryTokens.length > 1 &&
          [normalizedSlug, ...normalizedSlugs].some((value) => queryTokens.every((token) => value.includes(token)));
        const categoryIncludes = normalizedCategories.some((value) =>
          value.includes(normalizedQuery),
        );
        const categoryTokenIncludes =
          !categoryIncludes &&
          queryTokens.length > 1 &&
          normalizedCategories.some((value) => queryTokens.every((token) => value.includes(token)));
        const codeIncludes = normalizedCode.includes(normalizedQuery);
        const codeTokenIncludes =
          !codeIncludes &&
          queryTokens.length > 1 &&
          queryTokens.every((token) => normalizedCode.includes(token));

        if (
          !nameStarts &&
          !nameIncludes &&
          !nameTokenIncludes &&
          !slugStarts &&
          !slugIncludes &&
          !slugTokenIncludes &&
          !categoryIncludes &&
          !categoryTokenIncludes &&
          !codeIncludes &&
          !codeTokenIncludes
        ) {
          return null;
        }

        const rank = nameStarts
          ? 0
          : nameIncludes
            ? 1
            : nameTokenIncludes
              ? 2
              : slugStarts
                ? 3
                : slugIncludes
                  ? 4
                  : slugTokenIncludes
                    ? 5
                    : categoryIncludes
                      ? 6
                      : categoryTokenIncludes
                        ? 7
                        : codeIncludes
                          ? 8
                          : 9;

        const sortName = normalizedName || name.toLowerCase();
        const sortCodeOrSlug =
          normalizedCode || normalizedSlug || normalizedSlugs[0] || '';

        const result: PriceListSearchItem & {
          _rank: number;
          _priorityRank: number;
          _sortName: string;
          _sortCodeOrSlug: string;
        } = {
          id: product._id.toString(),
          name,
          code: code || undefined,
          slug: slug || undefined,
          slugs: normalizedSlugs.length ? slugsRaw : undefined,
          categorySlugs: product.categorySlugs ?? undefined,
          categories: product.categories ?? undefined,
          isService: Boolean(product.isService),
          externalSource: product.externalSource ?? undefined,
          imageUrl: castText(product.aaData?.image || product.povezavaDoSlike || '') || undefined,
          unit: resolveUnitFromName(name),
          unitPrice: Number(product.prodajnaCena ?? 0),
          vatRate: 22,
          _rank: rank,
          _priorityRank: resolvePriorityRank(resolvePriorityFromProductMap(categoryPriorityByPath, product as any)),
          _sortName: sortName,
          _sortCodeOrSlug: sortCodeOrSlug,
        };

        return result;
      })
      .filter((item): item is PriceListSearchItem & { _rank: number; _priorityRank: number; _sortName: string; _sortCodeOrSlug: string } =>
        Boolean(item),
      )
      .sort((a, b) => {
        if (a._rank !== b._rank) return a._rank - b._rank;
        if (a._priorityRank !== b._priorityRank) return a._priorityRank - b._priorityRank;
        const nameCmp = a._sortName.localeCompare(b._sortName);
        if (nameCmp !== 0) return nameCmp;
        return a._sortCodeOrSlug.localeCompare(b._sortCodeOrSlug);
      })
      .map(({ _rank, _priorityRank, _sortName, _sortCodeOrSlug, ...item }) => item);

    res.success(matches);
  } catch (_error) {
    res.fail('Napaka pri iskanju po ceniku');
  }
}

function normalizeSearchValue(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveUnitFromName(name: string) {
  const normalized = name.trim();
  const match = normalized.match(/\[([^\]]+)\]\s*\*?\s*$/);
  const raw = match?.[1]?.trim();
  if (!raw) return 'kos';

  const withoutCurrency = raw.replace(/[€$£]/g, '').trim();
  const slashParts = withoutCurrency.split('/').map((part) => part.trim()).filter(Boolean);
  const candidate = (slashParts[slashParts.length - 1] ?? withoutCurrency).toLowerCase();
  return candidate || 'kos';
}

function resolvePriorityRank(priority: 1 | 2 | 3 | null) {
  return priority ?? 4;
}
