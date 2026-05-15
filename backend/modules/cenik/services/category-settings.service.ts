import { CategorySettingsModel, type CategorySettingsPriority } from '../category-settings.model';
import { ProductModel } from '../product.model';

type CategoryParts = {
  path: string;
  topLevel: string;
  subLevel: string | null;
  level: 1 | 2;
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
    level: 1,
  };
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function uniqueCategoryPartsFromCategories(categories: unknown[]) {
  const byPath = new Map<string, CategoryParts>();

  for (const category of categories) {
    const parts = splitAACategory(category);
    if (!parts) continue;
    const top = topCategory(parts);
    byPath.set(top.path, top);
    byPath.set(parts.path, parts);
  }

  return Array.from(byPath.values());
}

async function upsertMissingCategories(categories: CategoryParts[]) {
  const now = new Date();
  await Promise.all(
    categories.map((category) =>
      CategorySettingsModel.updateOne(
        { path: category.path },
        {
          $setOnInsert: {
            isActive: false,
            priority: null,
            productCountActive: 0,
            notes: '',
            createdAt: now,
          },
          $set: {
            topLevel: category.topLevel,
            subLevel: category.subLevel,
            level: category.level,
            source: SOURCE,
          },
        },
        { upsert: true },
      ),
    ),
  );
}

export async function initializeCategorySettingsFromCategories(categories: unknown[]) {
  const uniqueCategories = uniqueCategoryPartsFromCategories(categories);
  const apiCounts = countApiProductsByCategory(categories);
  await upsertMissingCategories(uniqueCategories);
  await updateProductCountInApi(apiCounts);
  return listCategorySettings();
}

function countApiProductsByCategory(categories: unknown[]) {
  const counts = new Map<string, number>();

  for (const category of categories) {
    const parts = splitAACategory(category);
    if (!parts) continue;
    increment(counts, parts.topLevel);
    if (parts.subLevel) {
      increment(counts, parts.path);
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

export async function refreshCategoryStatsFromDatabase() {
  const products = await ProductModel.find({
    externalSource: SOURCE,
    isActive: { $ne: false },
  })
    .select({ 'aaData.category': 1 })
    .lean();

  const counts = new Map<string, number>();
  for (const product of products) {
    const parts = splitAACategory((product as any)?.aaData?.category);
    if (!parts) continue;
    increment(counts, parts.topLevel);
    if (parts.subLevel) {
      increment(counts, parts.path);
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

export async function listCategorySettings() {
  return CategorySettingsModel.find({ source: SOURCE }).sort({ level: 1, topLevel: 1, subLevel: 1 }).lean();
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

  if (current.level === 2 && current.isActive) {
    await CategorySettingsModel.updateOne({ path: current.topLevel }, { $set: { isActive: true } });
  }

  if (current.level === 1 && input.isActive === false) {
    await CategorySettingsModel.updateMany({ topLevel: current.topLevel, level: 2 }, { $set: { isActive: false } });
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

  const activeSubCategories = await CategorySettingsModel.find({ source: SOURCE, level: 2, isActive: true })
    .select({ topLevel: 1 })
    .lean();
  const topLevelsToActivate = Array.from(new Set(activeSubCategories.map((category) => category.topLevel)));
  if (topLevelsToActivate.length > 0) {
    await CategorySettingsModel.updateMany({ source: SOURCE, path: { $in: topLevelsToActivate } }, { $set: { isActive: true } });
  }

  return listCategorySettings();
}

export async function filterAAImportItemsByCategorySettings<T extends { aaData?: { category?: string } }>(items: T[]) {
  const settingsCount = await CategorySettingsModel.countDocuments({ source: SOURCE });
  if (settingsCount === 0) {
    return { items, filteringEnabled: false, totalBeforeFilter: items.length, totalAfterFilter: items.length };
  }

  const categories = items.map((item) => item.aaData?.category ?? '');
  await refreshCategoryStatsFromApiCategories(categories);

  const settings = (await CategorySettingsModel.find({ source: SOURCE }).lean()) as Array<{
    path: string;
    isActive: boolean;
  }>;
  const settingsByPath = new Map(settings.map((setting) => [setting.path, setting]));

  const filtered = items.filter((item) => {
    const parts = splitAACategory(item.aaData?.category);
    if (!parts) return false;

    const exact = settingsByPath.get(parts.path);
    if (parts.level === 2 && exact) {
      return exact.isActive;
    }

    const top = settingsByPath.get(parts.topLevel);
    return Boolean(top?.isActive);
  });

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
