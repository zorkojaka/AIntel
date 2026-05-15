import {
  CategorySettingsModel,
  type CategorySettingsPriority,
  type CategorySettingsSegmentType,
} from '../category-settings.model';
import { ProductModel } from '../product.model';

type CategoryParts = {
  path: string;
  topLevel: string;
  subLevel: string | null;
  thirdLevel?: string | null;
  segmentType?: CategorySettingsSegmentType;
  level: 1 | 2 | 3;
};

type AAProductLike = {
  name?: string;
  ime?: string;
  category?: string;
  proizvajalec?: string;
  attributes?: Array<{ attribute?: string; term?: string }>;
  aaData?: {
    category?: string;
    productCode?: string;
    attributes?: Array<{ attribute?: string; term?: string }>;
  };
};

type CategoryUpdate = {
  path: string;
  isActive?: boolean;
  priority?: CategorySettingsPriority;
  notes?: string;
};

const SOURCE = 'aa_api' as const;

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeComparable(value: unknown) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function splitAACategory(category: unknown): CategoryParts | null {
  const parts = normalizeText(category)
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  const topLevel = parts[0];
  const subLevel = parts.length > 1 ? parts.slice(1).join(':') : null;

  return {
    path: subLevel ? `${topLevel}:${subLevel}` : topLevel,
    topLevel,
    subLevel,
    level: subLevel ? 2 : 1,
  };
}

function topCategory(parts: CategoryParts): CategoryParts {
  return {
    path: parts.topLevel,
    topLevel: parts.topLevel,
    subLevel: null,
    thirdLevel: null,
    segmentType: null,
    level: 1,
  };
}

function subCategory(parts: CategoryParts): CategoryParts | null {
  if (!parts.subLevel) return null;
  return {
    path: `${parts.topLevel}:${parts.subLevel}`,
    topLevel: parts.topLevel,
    subLevel: parts.subLevel,
    thirdLevel: null,
    segmentType: null,
    level: 2,
  };
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function getProductCategory(product: AAProductLike) {
  return product.aaData?.category ?? product.category ?? '';
}

function getProductName(product: AAProductLike) {
  return product.name ?? product.ime ?? product.aaData?.productCode ?? '';
}

function getAttribute(product: AAProductLike, attributeName: string) {
  const attributes = product.attributes ?? product.aaData?.attributes ?? [];
  const normalizedName = normalizeComparable(attributeName);
  return (
    attributes.find((attribute) => normalizeComparable(attribute.attribute) === normalizedName)?.term ?? ''
  );
}

function normalizeBrand(rawBrand: unknown) {
  const value = normalizeText(rawBrand);
  const comparable = normalizeComparable(value);
  if (!comparable) return '';
  if (comparable.includes('hik')) return 'Hikvision';
  if (comparable === 'dvc') return 'DVC';
  if (comparable.includes('ajax')) return 'Ajax';
  if (comparable.includes('reo')) return 'Reolink';
  if (comparable === 'inout') return 'INOut';
  if (comparable.includes('western') || comparable === 'wd') return 'Western Digital';
  return value;
}

function inferAAProductBrand(product: AAProductLike) {
  const manufacturer = normalizeBrand(product.proizvajalec || getAttribute(product, 'Manufacturer'));
  if (manufacturer) return manufacturer;

  const name = normalizeComparable(getProductName(product));
  if (/\bajax\b/.test(name)) return 'Ajax';
  if (/\b(ds-|hikvision|hiwatch)\b/.test(name)) return 'Hikvision';
  if (/\bdvc\b|\bdc[anptkv]-|\bddn-|\bdon-|\bdosn-|\bdab-|\bdac-|\bdan-/.test(name)) return 'DVC';
  if (/\breo\b|reolink/.test(name)) return 'Reolink';
  if (/\binout\b/.test(name)) return 'INOut';
  if (/\bwd\b|western/.test(name)) return 'Western Digital';
  return '(unknown)';
}

function inferAlarmSystemLine(product: AAProductLike) {
  const name = normalizeComparable(getProductName(product));
  if (/\bfibra\b/.test(name)) return 'Ajax Fibra';
  if (/\bajax\b/.test(name)) return 'Ajax wireless / other';
  if (/\bpar\b|paradox/.test(name)) return 'Paradox';
  if (/\bdsc\b/.test(name)) return 'DSC';
  if (/\binim\b|\bi-?smart/.test(name)) return 'Inim';
  if (/\boptex\b/.test(name)) return 'OPTEX';
  return normalizeBrand(product.proizvajalec || getAttribute(product, 'Manufacturer'));
}

export function deriveAAThirdLevelCategory(product: AAProductLike): CategoryParts | null {
  const base = splitAACategory(getProductCategory(product));
  if (!base?.subLevel) return null;

  let thirdLevel = '';
  let segmentType: CategorySettingsSegmentType = null;

  if (base.topLevel === 'Protivlomni sistemi') {
    thirdLevel = inferAlarmSystemLine(product);
    segmentType = 'system_line';
  } else {
    thirdLevel = inferAAProductBrand(product);
    segmentType = 'brand';
  }

  if (!thirdLevel) {
    thirdLevel = inferAAProductBrand(product);
    segmentType = 'system_line';
  }

  if (!thirdLevel) return null;

  return {
    path: `${base.path}:${thirdLevel}`,
    topLevel: base.topLevel,
    subLevel: base.subLevel,
    thirdLevel,
    segmentType,
    level: 3,
  };
}

function uniqueCategoryPartsFromProducts(products: AAProductLike[]) {
  const byPath = new Map<string, CategoryParts>();

  for (const product of products) {
    const parts = splitAACategory(getProductCategory(product));
    if (!parts) continue;
    const top = topCategory(parts);
    byPath.set(top.path, top);
    const sub = subCategory(parts);
    if (sub) byPath.set(sub.path, sub);
    const third = deriveAAThirdLevelCategory(product);
    if (third) byPath.set(third.path, third);
  }

  return Array.from(byPath.values());
}

function uniqueCategoryPartsFromCategories(categories: unknown[]) {
  return uniqueCategoryPartsFromProducts(categories.map((category) => ({ category: normalizeText(category) })));
}

async function upsertMissingCategories(categories: CategoryParts[]) {
  const now = new Date();
  const existingSettings = (await CategorySettingsModel.find({ source: SOURCE })
    .select({ path: 1, isActive: 1 })
    .lean()) as Array<{ path: string; isActive: boolean }>;
  const activeByPath = new Map(existingSettings.map((setting) => [setting.path, setting.isActive]));

  await Promise.all(
    categories.map((category) => {
      const parentPath = category.level === 3 ? `${category.topLevel}:${category.subLevel}` : category.topLevel;
      const defaultActive = category.level === 3 ? Boolean(activeByPath.get(parentPath)) : false;
      return CategorySettingsModel.updateOne(
        { path: category.path },
        {
          $setOnInsert: {
            isActive: defaultActive,
            priority: null,
            productCountActive: 0,
            notes: '',
            createdAt: now,
          },
          $set: {
            topLevel: category.topLevel,
            subLevel: category.subLevel,
            thirdLevel: category.thirdLevel ?? null,
            segmentType: category.segmentType ?? null,
            level: category.level,
            source: SOURCE,
          },
        },
        { upsert: true },
      );
    }),
  );
}

export async function initializeCategorySettingsFromCategories(categories: unknown[]) {
  const uniqueCategories = uniqueCategoryPartsFromCategories(categories);
  const apiCounts = countApiProductsByCategory(categories);
  await upsertMissingCategories(uniqueCategories);
  await updateProductCountInApi(apiCounts);
  return listCategorySettings();
}

export async function initializeCategorySettingsFromProducts(products: AAProductLike[]) {
  const uniqueCategories = uniqueCategoryPartsFromProducts(products);
  const apiCounts = countApiProducts(products);
  await upsertMissingCategories(uniqueCategories);
  await updateProductCountInApi(apiCounts);
  return listCategorySettings();
}

function countApiProductsByCategory(categories: unknown[]) {
  return countApiProducts(categories.map((category) => ({ category: normalizeText(category) })));
}

function countApiProducts(products: AAProductLike[]) {
  const counts = new Map<string, number>();

  for (const product of products) {
    const parts = splitAACategory(getProductCategory(product));
    if (!parts) continue;
    increment(counts, parts.topLevel);
    if (parts.subLevel) {
      increment(counts, parts.path);
    }
    const third = deriveAAThirdLevelCategory(product);
    if (third) {
      increment(counts, third.path);
    }
  }

  return counts;
}

async function updateProductCountInApi(counts: Map<string, number>) {
  const now = new Date();
  const allPaths = Array.from(counts.keys());

  if (allPaths.length > 0) {
    await CategorySettingsModel.updateMany(
      { source: SOURCE, path: { $nin: allPaths } },
      { $set: { productCountInApi: 0, lastSyncedAt: now } },
    );
  }

  await Promise.all(
    allPaths.map((path) =>
      CategorySettingsModel.updateOne(
        { path },
        {
          $set: {
            productCountInApi: counts.get(path) ?? 0,
            lastSyncedAt: now,
            source: SOURCE,
          },
        },
      ),
    ),
  );
}

export async function refreshCategoryStatsFromApiCategories(categories: unknown[]) {
  const settingsCount = await CategorySettingsModel.countDocuments({ source: SOURCE });
  if (settingsCount === 0) {
    return { initialized: false, settings: [] };
  }

  const uniqueCategories = uniqueCategoryPartsFromCategories(categories);
  await upsertMissingCategories(uniqueCategories);
  await updateProductCountInApi(countApiProductsByCategory(categories));
  return { initialized: true, settings: await listCategorySettings() };
}

export async function refreshCategoryStatsFromApiProducts(products: AAProductLike[]) {
  const settingsCount = await CategorySettingsModel.countDocuments({ source: SOURCE });
  if (settingsCount === 0) {
    return { initialized: false, settings: [] };
  }

  await upsertMissingCategories(uniqueCategoryPartsFromProducts(products));
  await updateProductCountInApi(countApiProducts(products));
  return { initialized: true, settings: await listCategorySettings() };
}

export async function refreshCategoryStatsFromDatabase() {
  const products = await ProductModel.find({
    externalSource: SOURCE,
    isActive: { $ne: false },
  })
    .select({ ime: 1, proizvajalec: 1, 'aaData.category': 1, 'aaData.productCode': 1, 'aaData.attributes': 1 })
    .lean();

  const counts = new Map<string, number>();
  for (const product of products) {
    const productLike = product as AAProductLike;
    const parts = splitAACategory(productLike.aaData?.category);
    if (!parts) continue;
    increment(counts, parts.topLevel);
    if (parts.subLevel) {
      increment(counts, parts.path);
    }
    const third = deriveAAThirdLevelCategory(productLike);
    if (third) {
      increment(counts, third.path);
    }
  }

  await Promise.all(
    Array.from(counts.keys()).map((path) =>
      CategorySettingsModel.updateOne(
        { path },
        {
          $set: {
            productCountActive: counts.get(path) ?? 0,
            lastSyncedAt: new Date(),
          },
        },
      ),
    ),
  );

  await CategorySettingsModel.updateMany(
    { source: SOURCE, path: { $nin: Array.from(counts.keys()) } },
    { $set: { productCountActive: 0 } },
  );

  return listCategorySettings();
}

function sanitizePriority(value: unknown): CategorySettingsPriority | undefined {
  if (value === null) return null;
  if (value === 1 || value === 2 || value === 3) return value;
  return undefined;
}

function buildUpdatePayload(update: CategoryUpdate) {
  const $set: Record<string, unknown> = {};
  if (typeof update.isActive === 'boolean') $set.isActive = update.isActive;
  if (update.priority !== undefined) $set.priority = update.priority;
  if (typeof update.notes === 'string') $set.notes = update.notes.trim();
  return $set;
}

function isProductAllowedBySettings(
  product: AAProductLike,
  settingsByPath: Map<string, { isActive: boolean }>,
) {
  const parts = splitAACategory(getProductCategory(product));
  if (!parts) return false;

  const third = deriveAAThirdLevelCategory(product);
  if (third) {
    const exactThird = settingsByPath.get(third.path);
    if (exactThird) {
      return exactThird.isActive;
    }
  }

  const exact = settingsByPath.get(parts.path);
  if (parts.level === 2 && exact) {
    return exact.isActive;
  }

  const top = settingsByPath.get(parts.topLevel);
  return Boolean(top?.isActive);
}

export async function listCategorySettings() {
  return CategorySettingsModel.find({ source: SOURCE })
    .sort({ level: 1, topLevel: 1, subLevel: 1, thirdLevel: 1 })
    .lean();
}

export async function updateCategorySettingById(id: string, input: Omit<CategoryUpdate, 'path'>) {
  const priority = input.priority === undefined ? undefined : sanitizePriority(input.priority);
  if (input.priority !== undefined && priority === undefined) {
    throw new Error('Priority must be 1, 2, 3, or null.');
  }

  const current = await CategorySettingsModel.findById(id);
  if (!current) return null;

  const update = buildUpdatePayload({
    path: current.path,
    isActive: input.isActive,
    priority,
    notes: input.notes,
  });

  if (Object.keys(update).length > 0) {
    current.set(update);
    await current.save();
  }

  if ((current.level === 2 || current.level === 3) && current.isActive) {
    await CategorySettingsModel.updateOne({ path: current.topLevel }, { $set: { isActive: true } });
  }
  if (current.level === 3 && current.isActive) {
    await CategorySettingsModel.updateOne(
      { topLevel: current.topLevel, subLevel: current.subLevel, level: 2 },
      { $set: { isActive: true } },
    );
  }

  if (current.level === 1 && input.isActive === false) {
    await CategorySettingsModel.updateMany({ topLevel: current.topLevel, level: { $in: [2, 3] } }, { $set: { isActive: false } });
  }
  if (current.level === 2 && input.isActive === false) {
    await CategorySettingsModel.updateMany(
      { topLevel: current.topLevel, subLevel: current.subLevel, level: 3 },
      { $set: { isActive: false } },
    );
  }

  return CategorySettingsModel.findById(id).lean();
}

export async function bulkUpdateCategorySettings(updates: CategoryUpdate[]) {
  for (const rawUpdate of updates) {
    const path = normalizeText(rawUpdate.path);
    if (!path) {
      throw new Error('Every update must include path.');
    }

    const priority = rawUpdate.priority === undefined ? undefined : sanitizePriority(rawUpdate.priority);
    if (rawUpdate.priority !== undefined && priority === undefined) {
      throw new Error(`Invalid priority for "${path}".`);
    }

    const update = buildUpdatePayload({
      path,
      isActive: rawUpdate.isActive,
      priority,
      notes: rawUpdate.notes,
    });
    if (Object.keys(update).length === 0) continue;

    await CategorySettingsModel.updateOne({ path, source: SOURCE }, { $set: update });
  }

  const inactiveTopCategories = await CategorySettingsModel.find({ source: SOURCE, level: 1, isActive: false })
    .select({ topLevel: 1 })
    .lean();
  const inactiveTopLevels = inactiveTopCategories.map((category) => category.topLevel);
  if (inactiveTopLevels.length > 0) {
    await CategorySettingsModel.updateMany(
      { source: SOURCE, topLevel: { $in: inactiveTopLevels }, level: { $in: [2, 3] } },
      { $set: { isActive: false } },
    );
  }

  const inactiveSubCategories = await CategorySettingsModel.find({ source: SOURCE, level: 2, isActive: false })
    .select({ topLevel: 1, subLevel: 1 })
    .lean();
  await Promise.all(
    inactiveSubCategories.map((category) =>
      CategorySettingsModel.updateMany(
        { source: SOURCE, topLevel: category.topLevel, subLevel: category.subLevel, level: 3 },
        { $set: { isActive: false } },
      ),
    ),
  );

  const activeChildren = await CategorySettingsModel.find({ source: SOURCE, level: { $in: [2, 3] }, isActive: true })
    .select({ topLevel: 1, subLevel: 1, level: 1 })
    .lean();
  const topLevelsToActivate = Array.from(new Set(activeChildren.map((category) => category.topLevel)));
  if (topLevelsToActivate.length > 0) {
    await CategorySettingsModel.updateMany({ source: SOURCE, path: { $in: topLevelsToActivate } }, { $set: { isActive: true } });
  }
  const subPathsToActivate = Array.from(
    new Set(
      activeChildren
        .filter((category) => category.level === 3 && category.subLevel)
        .map((category) => `${category.topLevel}:${category.subLevel}`),
    ),
  );
  if (subPathsToActivate.length > 0) {
    await CategorySettingsModel.updateMany({ source: SOURCE, path: { $in: subPathsToActivate } }, { $set: { isActive: true } });
  }

  await syncAAProductActiveStateWithCategorySettings();

  return listCategorySettings();
}

export async function syncAAProductActiveStateWithCategorySettings() {
  const settings = (await CategorySettingsModel.find({ source: SOURCE }).lean()) as Array<{
    path: string;
    isActive: boolean;
  }>;
  if (settings.length === 0) {
    return { matched: 0, activated: 0, deactivated: 0 };
  }

  const settingsByPath = new Map(settings.map((setting) => [setting.path, setting]));
  const products = await ProductModel.find({ externalSource: SOURCE })
    .select({ _id: 1, ime: 1, proizvajalec: 1, isActive: 1, 'aaData.category': 1, 'aaData.productCode': 1, 'aaData.attributes': 1 })
    .lean();

  const idsToActivate: unknown[] = [];
  const idsToDeactivate: unknown[] = [];

  for (const product of products) {
    const productLike = product as AAProductLike & { _id: unknown; isActive?: boolean };
    const shouldBeActive = isProductAllowedBySettings(productLike, settingsByPath);
    if (shouldBeActive && productLike.isActive === false) {
      idsToActivate.push(productLike._id);
    } else if (!shouldBeActive && productLike.isActive !== false) {
      idsToDeactivate.push(productLike._id);
    }
  }

  if (idsToActivate.length > 0) {
    await ProductModel.updateMany({ _id: { $in: idsToActivate } }, { $set: { isActive: true } });
  }
  if (idsToDeactivate.length > 0) {
    await ProductModel.updateMany({ _id: { $in: idsToDeactivate } }, { $set: { isActive: false } });
  }

  await refreshCategoryStatsFromDatabase();

  return {
    matched: products.length,
    activated: idsToActivate.length,
    deactivated: idsToDeactivate.length,
  };
}

export async function filterAAImportItemsByCategorySettings<T extends AAProductLike>(items: T[]) {
  const settingsCount = await CategorySettingsModel.countDocuments({ source: SOURCE });
  if (settingsCount === 0) {
    return { items, filteringEnabled: false, totalBeforeFilter: items.length, totalAfterFilter: items.length };
  }

  await refreshCategoryStatsFromApiProducts(items);

  const settings = (await CategorySettingsModel.find({ source: SOURCE }).lean()) as Array<{
    path: string;
    isActive: boolean;
  }>;
  const settingsByPath = new Map(settings.map((setting) => [setting.path, setting]));

  const filtered = items.filter((item) => isProductAllowedBySettings(item, settingsByPath));

  return {
    items: filtered,
    filteringEnabled: true,
    totalBeforeFilter: items.length,
    totalAfterFilter: filtered.length,
  };
}

export async function resolveCategoryPriority(category: unknown): Promise<CategorySettingsPriority> {
  const parts = splitAACategory(category);
  if (!parts) return null;

  const paths = parts.subLevel ? [parts.path, parts.topLevel] : [parts.topLevel];
  const settings = (await CategorySettingsModel.find({ source: SOURCE, path: { $in: paths } })
    .select({ path: 1, priority: 1 })
    .lean()) as Array<{ path: string; priority: CategorySettingsPriority }>;
  const byPath = new Map<string, CategorySettingsPriority>(settings.map((setting) => [setting.path, setting.priority]));
  return byPath.get(parts.path) ?? byPath.get(parts.topLevel) ?? null;
}

export async function buildCategoryPriorityMap() {
  const settings = (await CategorySettingsModel.find({ source: SOURCE })
    .select({ path: 1, priority: 1 })
    .lean()) as Array<{ path: string; priority: CategorySettingsPriority }>;
  return new Map<string, CategorySettingsPriority>(settings.map((setting) => [setting.path, setting.priority]));
}

export function resolvePriorityFromMap(priorityByPath: Map<string, CategorySettingsPriority>, category: unknown) {
  const parts = splitAACategory(category);
  if (!parts) return null;
  return priorityByPath.get(parts.path) ?? priorityByPath.get(parts.topLevel) ?? null;
}

export function resolvePriorityFromProductMap(priorityByPath: Map<string, CategorySettingsPriority>, product: AAProductLike) {
  const third = deriveAAThirdLevelCategory(product);
  if (third) {
    const thirdPriority = priorityByPath.get(third.path);
    if (thirdPriority) return thirdPriority;
  }

  return resolvePriorityFromMap(priorityByPath, getProductCategory(product));
}
