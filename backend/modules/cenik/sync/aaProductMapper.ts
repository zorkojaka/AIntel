import { IMPORT_DEFAULTS } from './importDefaults';
import { classifyProduct, getAttribute } from './classifier';
import type { AAProductRaw } from './types';
import { applyReolinkImageOverride } from '../services/reolink-image-overrides';

const AA_PRODUCT_FIELDS = [
  'externalSource',
  'externalId',
  'externalKey',
  'ime',
  'kategorija',
  'categorySlugs',
  'purchasePriceWithoutVat',
  'nabavnaCena',
  'prodajnaCena',
  'kratekOpis',
  'dolgOpis',
  'povezavaDoSlike',
  'povezavaDoProdukta',
  'proizvajalec',
  'dobavitelj',
  'naslovDobavitelja',
  'isService',
  'aaData',
  'classification',
] as const;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(normalizeSlug).filter(Boolean)));
}

function resolveProductPageUrl(product: AAProductRaw) {
  const categoryPath = (product.category ?? '')
    .split(':')
    .map((part) => normalizeSlug(part.trim()))
    .filter(Boolean)
    .join('/');
  const productSlug = normalizeSlug(product.name);
  const productId = product.id.replace(/^0+/, '') || product.id;

  if (!categoryPath || !productSlug || !productId) {
    return 'https://b2b.alarmautomatika.com/si';
  }

  return `https://b2b.alarmautomatika.com/si/${categoryPath}/${productSlug}/${productId}`;
}

function resolveCategorySlugs(product: AAProductRaw, productType: string | undefined, manufacturer: string | undefined) {
  const rawCategoryParts = (product.category ?? '')
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean);

  const slugs = [
    manufacturer ?? '',
    productType ?? '',
    ...rawCategoryParts,
  ];

  if (productType === 'kamera') slugs.push('videonadzor', 'kamera');
  if (productType === 'snemalnik') slugs.push('videonadzor', 'snemalnik');
  if (productType === 'nosilec') slugs.push('nosilci');
  if (productType === 'alarm_komponenta') slugs.push('alarm');
  if (productType === 'disk') slugs.push('disk');
  if (productType === 'switch') slugs.push('switch');

  return unique(slugs);
}

function resolveDisplayCategory(product: AAProductRaw, productType: string | undefined) {
  if (productType && productType !== 'drugo') return productType;
  const lastPart = (product.category ?? '').split(':').map((part) => part.trim()).filter(Boolean).pop();
  return lastPart ? normalizeSlug(lastPart) : 'drugo';
}

export function mapAAProductToImportItem(product: AAProductRaw) {
  const classification = classifyProduct(product);
  const manufacturer = getAttribute(product.attributes, 'Manufacturer') ?? classification.manufacturer ?? '';
  const discount = Number.isFinite(product.discount ?? 0) ? product.discount ?? 0 : 0;
  const finalPurchasePrice = roundMoney(product.price * (1 - discount / 100));
  const sellingPrice = roundMoney(product.price);
  const description = product.description ?? '';
  const defaults = IMPORT_DEFAULTS.aa_api;

  return applyReolinkImageOverride({
    externalSource: 'aa_api',
    externalId: product.id,
    externalKey: `aa_api:${product.id}`,
    ime: product.name,
    kategorija: resolveDisplayCategory(product, classification.productType),
    categorySlugs: resolveCategorySlugs(product, classification.productType, manufacturer),
    purchasePriceWithoutVat: finalPurchasePrice,
    nabavnaCena: finalPurchasePrice,
    prodajnaCena: sellingPrice,
    kratekOpis: description.slice(0, 200),
    dolgOpis: description,
    povezavaDoSlike: product.image ?? '',
    povezavaDoProdukta: resolveProductPageUrl(product),
    proizvajalec: manufacturer,
    dobavitelj: defaults.dobavitelj,
    naslovDobavitelja: defaults.naslovDobavitelja,
    isService: false,
    aaData: {
      productCode: product.name,
      image: product.image ?? '',
      category: product.category ?? '',
      attributes: product.attributes ?? [],
      rawDescription: description,
      stock: product.stock ?? '',
      vat: product.vat,
      lastSyncedAt: new Date(),
    },
    classification,
    __providedFields: AA_PRODUCT_FIELDS,
  });
}

export function mapAAProductsToImportItems(products: AAProductRaw[]) {
  return products.map(mapAAProductToImportItem);
}
