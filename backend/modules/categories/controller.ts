import { Request, Response } from 'express';
import { CategoryModel } from './schema';
import { normalizeSlug } from './utils/slug';

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
