import { CategorySettingsModel } from '../category-settings.model';

type ProductLike = {
  nabavnaCena: number;
  prodajnaCena: number;
  categorySlugs?: string[];
  isService?: boolean;
  proizvajalec?: string;
  aaData?: {
    category?: string;
    productCode?: string;
    attributes?: Array<{ attribute?: string; term?: string }>;
  };
};

export type CategoryMarginPricingInfo = {
  marginPercent: number;
  basePrice: number;
  increaseAmount: number;
  appliedCategoryPath: string;
};

type MarginSetting = {
  path: string;
  topLevel: string;
  subLevel?: string | null;
  thirdLevel?: string | null;
  isActive: boolean;
  marginPercent?: number;
};

export async function loadCategoryMarginSettings() {
  return CategorySettingsModel.find({ source: 'aa_api', marginPercent: { $gt: 0 } })
    .select({ path: 1, topLevel: 1, subLevel: 1, thirdLevel: 1, isActive: 1, marginPercent: 1 })
    .lean();
}

function normalizeSlug(value: unknown) {
  return typeof value === 'string'
    ? value
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    : '';
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeComparable(value: unknown) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function splitAACategory(category: unknown) {
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
  };
}

function getAttribute(product: ProductLike, attributeName: string) {
  const attributes = product.aaData?.attributes ?? [];
  const normalizedName = normalizeComparable(attributeName);
  return attributes.find((attribute) => normalizeComparable(attribute.attribute) === normalizedName)?.term ?? '';
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

function deriveAAThirdLevelCategory(product: ProductLike) {
  const base = splitAACategory(product.aaData?.category);
  if (!base?.subLevel) return null;
  const thirdLevel = normalizeBrand(product.proizvajalec || getAttribute(product, 'Manufacturer'));
  if (!thirdLevel) return null;
  return {
    path: `${base.path}:${thirdLevel}`,
    topLevel: base.topLevel,
    subLevel: base.subLevel,
    thirdLevel,
  };
}

function getProductSettingPaths(product: ProductLike) {
  const paths = new Set<string>();
  const parts = splitAACategory(product.aaData?.category);
  if (parts) {
    paths.add(parts.topLevel);
    paths.add(parts.path);
  }
  const third = deriveAAThirdLevelCategory(product);
  if (third) {
    paths.add(third.path);
  }
  return paths;
}

function settingMatchesProductSlugs(setting: MarginSetting, product: ProductLike) {
  const slugs = new Set((product.categorySlugs ?? []).map(normalizeSlug).filter(Boolean));
  if (slugs.size === 0) {
    return false;
  }
  return [
    setting.path,
    setting.topLevel,
    setting.subLevel,
    setting.thirdLevel,
  ].some((part) => slugs.has(normalizeSlug(part)));
}

export function resolveCategoryMarginPricingInfo(
  product: ProductLike,
  settings: MarginSetting[],
): CategoryMarginPricingInfo | null {
  if (product.isService === true || product.nabavnaCena <= 0) {
    return null;
  }

  const productPaths = getProductSettingPaths(product);
  const matches = settings
    .filter((setting) => setting.isActive && Number(setting.marginPercent ?? 0) > 0)
    .filter((setting) => productPaths.has(setting.path) || settingMatchesProductSlugs(setting, product))
    .sort((left, right) => {
      const leftMargin = Number(left.marginPercent ?? 0);
      const rightMargin = Number(right.marginPercent ?? 0);
      return rightMargin - leftMargin || right.path.length - left.path.length;
    });

  const selected = matches[0];
  if (!selected) {
    return null;
  }

  const marginPercent = Number(selected.marginPercent ?? 0);
  const sellingPrice = roundMoney(product.nabavnaCena * (1 + marginPercent / 100));
  return {
    marginPercent,
    basePrice: product.nabavnaCena,
    increaseAmount: roundMoney(sellingPrice - product.nabavnaCena),
    appliedCategoryPath: selected.path,
  };
}

export async function applyCategoryMarginSellingPrice<T extends ProductLike>(product: T): Promise<T> {
  const settings = await loadCategoryMarginSettings();
  const info = resolveCategoryMarginPricingInfo(product, settings);
  if (!info) {
    return product;
  }
  return {
    ...product,
    prodajnaCena: roundMoney(product.nabavnaCena * (1 + info.marginPercent / 100)),
  };
}

export async function resolveCategoryMarginInfo(product: ProductLike) {
  const settings = await loadCategoryMarginSettings();
  return resolveCategoryMarginPricingInfo(product, settings);
}
