import { Request, Response } from 'express';
import { CategoryModel } from './schema';
import { normalizeSlug } from './utils/slug';
import { ProductModel } from '../cenik/product.model';

type CreateCategoryPayload = {
  name: string;
  slug?: string;
  color?: string;
  order?: number;
};

export async function listCategories(_req: Request, res: Response) {
  try {
    const categories = await CategoryModel.find().sort({ order: 1, name: 1 }).lean();
    res.success(categories);
  } catch (error) {
    res.fail('Ne morem pridobiti kategorij');
  }
}

export async function createCategory(req: Request, res: Response) {
  try {
    const payload: CreateCategoryPayload = req.body;
    const name = payload.name?.trim();
    if (!name) {
      return res.fail('Naziv je obvezen', 400);
    }
    const slug = normalizeSlug(payload.slug ?? name);
    const existing = await CategoryModel.findOne({ slug });
    if (existing) {
      return res.fail('Slug že obstaja', 409);
    }
    const category = await CategoryModel.create({
      name,
      slug,
      color: payload.color?.trim(),
      order: payload.order ?? 0
    });
    res.success(category, 201);
  } catch (error) {
    res.fail('Ne morem ustvariti kategorije');
  }
}

function humanizeSlug(slug: string) {
  const trimmed = slug.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/[-_]+/g).filter(Boolean);
  return parts
    .map((part) => {
      if (part === 'ajax') return 'AJAX';
      if (part.length <= 3) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

export async function listProjectCategoryOptions(_req: Request, res: Response) {
  try {
    const rawSlugs = await ProductModel.distinct('categorySlugs');
    const slugs = (rawSlugs as unknown[])
      .filter((slug): slug is string => typeof slug === 'string')
      .map((slug) => slug.trim())
      .filter((slug) => slug.length > 0);

    const uniqueSorted = Array.from(new Set(slugs)).sort((a, b) =>
      a.localeCompare(b, 'sl', { sensitivity: 'base' })
    );

    const options = uniqueSorted.map((slug) => ({
      slug,
      label: humanizeSlug(slug)
    }));

    res.json({ options });
  } catch (error) {
    console.error('Ne morem pridobiti projektnih kategorij:', error);
    res.status(500).json({ options: [] });
  }
}
