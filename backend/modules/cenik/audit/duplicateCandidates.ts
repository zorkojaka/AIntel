import { ProductModel } from '../product.model';

export type DuplicateCandidateProduct = {
  productId: string;
  ime: string;
  proizvajalec: string;
  dobavitelj: string;
  prodajnaCena: number;
  isService: boolean;
  externalKey: string;
  source: string;
  isActive: boolean;
};

export type DuplicateCandidateGroup = {
  groupKey: string;
  reasons: string[];
  products: DuplicateCandidateProduct[];
};

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeName(value: unknown) {
  const text = normalizeText(value);
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export async function getDuplicateCandidateGroups(): Promise<DuplicateCandidateGroup[]> {
  const products = await ProductModel.find({ isActive: { $ne: false } })
    .select({
      ime: 1,
      proizvajalec: 1,
      dobavitelj: 1,
      prodajnaCena: 1,
      isService: 1,
      externalKey: 1,
      externalSource: 1,
      isActive: 1,
    })
    .sort({ ime: 1, prodajnaCena: 1, _id: 1 })
    .lean();

  const groups = new Map<
    string,
    {
      reasons: string[];
      products: DuplicateCandidateProduct[];
    }
  >();

  for (const product of products) {
    const normalizedName = normalizeName(product.ime);
    if (!normalizedName) continue;

    const manufacturer = normalizeName(product.proizvajalec);
    const supplier = normalizeName(product.dobavitelj);
    const price = Number(product.prodajnaCena ?? 0);
    const serviceKey = Boolean(product.isService) ? 'service' : 'product';
    const groupKey = [normalizedName, serviceKey, price.toFixed(2), manufacturer || '-', supplier || '-'].join('::');

    const existing = groups.get(groupKey) ?? {
      reasons: [
        'same normalized name',
        'same type',
        'same selling price',
        'same manufacturer or both missing',
        'same supplier or both missing',
      ],
      products: [],
    };

    existing.products.push({
      productId: String(product._id),
      ime: normalizeText(product.ime),
      proizvajalec: normalizeText(product.proizvajalec),
      dobavitelj: normalizeText(product.dobavitelj),
      prodajnaCena: price,
      isService: Boolean(product.isService),
      externalKey: normalizeText(product.externalKey),
      source: normalizeText(product.externalSource),
      isActive: product.isActive !== false,
    });

    groups.set(groupKey, existing);
  }

  return Array.from(groups.entries())
    .filter(([, entry]) => entry.products.length > 1)
    .map(([groupKey, entry]) => ({
      groupKey,
      reasons: entry.reasons,
      products: entry.products,
    }))
    .sort((left, right) => left.groupKey.localeCompare(right.groupKey));
}
