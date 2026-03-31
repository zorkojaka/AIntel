import mongoose from 'mongoose';
import { Request, Response } from 'express';

import { getDuplicateCandidateGroups } from '../../cenik/audit/duplicateCandidates';
import { ProductModel } from '../../cenik/product.model';

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

export async function getProductDuplicateCandidates(_req: Request, res: Response) {
  try {
    const groups = await getDuplicateCandidateGroups();
    return res.success({ groups });
  } catch (error) {
    console.error('Product duplicate audit failed:', error);
    return res.fail('Audit duplikatov ni uspel.', 500);
  }
}

export async function mergeDuplicateProduct(req: Request, res: Response) {
  const sourceProductId =
    typeof req.body?.sourceProductId === 'string' ? req.body.sourceProductId.trim() : '';
  const targetProductId =
    typeof req.body?.targetProductId === 'string' ? req.body.targetProductId.trim() : '';

  if (!mongoose.isValidObjectId(sourceProductId) || !mongoose.isValidObjectId(targetProductId)) {
    return res.fail('Neveljaven product id.', 400);
  }
  if (sourceProductId === targetProductId) {
    return res.fail('Produkta ni mogoce zdruziti samega vase.', 400);
  }

  try {
    const [source, target] = await Promise.all([
      ProductModel.findById(sourceProductId),
      ProductModel.findById(targetProductId),
    ]);

    if (!source || !target) {
      return res.fail('Produkt ni najden.', 404);
    }
    if (source.isActive === false) {
      return res.fail('Izvorni produkt je ze neaktiven.', 400);
    }
    if (target.isActive === false) {
      return res.fail('Ciljni produkt mora ostati aktiven.', 400);
    }
    if (Boolean(source.isService) !== Boolean(target.isService)) {
      return res.fail('Ni dovoljeno zdruziti produkta in storitve.', 400);
    }

    const sourceName = normalizeName(source.ime);
    const targetName = normalizeName(target.ime);
    if (!sourceName || !targetName || sourceName !== targetName) {
      return res.fail('Zdruzitev je dovoljena samo za ujemajoce duplicate kandidate.', 400);
    }
    if (Number(source.prodajnaCena ?? 0) !== Number(target.prodajnaCena ?? 0)) {
      return res.fail('Zdruzitev zahteva enako prodajno ceno.', 400);
    }

    source.isActive = false;
    source.status = 'merged';
    source.mergedIntoProductId = target._id as mongoose.Types.ObjectId;
    await source.save();

    return res.success({
      sourceProductId,
      targetProductId,
      sourceStatus: source.status,
      sourceIsActive: source.isActive,
    });
  } catch (error) {
    console.error('Merge duplicate product failed:', error);
    return res.fail('Zdruzitev duplikata ni uspela.', 500);
  }
}
