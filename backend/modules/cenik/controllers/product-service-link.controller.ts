import mongoose from 'mongoose';
import { Request, Response } from 'express';
import type { ProductServiceLink } from '../../../../shared/types/product-service-link';
import { ProductModel } from '../product.model';
import { ProductServiceLinkDocument, ProductServiceLinkModel } from '../product-service-link.model';

type ProductWithLeanFields = {
  _id: mongoose.Types.ObjectId;
  ime?: string;
  prodajnaCena?: number;
  isService?: boolean;
};

type ProductServiceLinkResponse = ProductServiceLink;

function castText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (value === undefined || value === null) return '';
  return String(value);
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'da';
  }
  if (typeof value === 'number') return value === 1;
  return fallback;
}

function parseNumber(value: unknown, fallback?: number) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseQuantityMode(value: unknown): ProductServiceLink['quantityMode'] {
  return value === 'fixed' ? 'fixed' : 'same_as_product';
}

function toResponse(link: ProductServiceLinkDocument | any): ProductServiceLinkResponse {
  const serviceProductValue = (link as any).serviceProductId as mongoose.Types.ObjectId | ProductWithLeanFields;
  const populatedService =
    serviceProductValue && typeof serviceProductValue === 'object' && 'ime' in serviceProductValue
      ? serviceProductValue
      : null;

  return {
    id: String((link as any)._id),
    productId: String((link as any).productId),
    serviceProductId: populatedService ? String(populatedService._id) : String(serviceProductValue),
    quantityMode: link.quantityMode,
    fixedQuantity: typeof link.fixedQuantity === 'number' ? link.fixedQuantity : null,
    isDefault: Boolean(link.isDefault),
    sortOrder: typeof link.sortOrder === 'number' ? link.sortOrder : null,
    note: castText(link.note),
    serviceProduct: populatedService
      ? {
          id: String(populatedService._id),
          name: castText(populatedService.ime),
          unitPrice: Number(populatedService.prodajnaCena ?? 0),
        }
      : undefined,
  };
}

async function validateProducts(productId: string, serviceProductId: string) {
  if (!mongoose.isValidObjectId(productId) || !mongoose.isValidObjectId(serviceProductId)) {
    throw new Error('Neveljaven produkt ali storitev.');
  }

  const [product, service] = await Promise.all([
    ProductModel.findById(productId).select('_id isService').lean(),
    ProductModel.findById(serviceProductId).select('_id isService').lean(),
  ]);

  if (!product) {
    throw new Error('Izvorni produkt ne obstaja.');
  }
  if (product.isService) {
    throw new Error('Izvorni produkt ne sme biti storitev.');
  }
  if (!service) {
    throw new Error('Povezana storitev ne obstaja.');
  }
  if (!service.isService) {
    throw new Error('Povezani cilj mora biti storitev.');
  }
}

function buildPayload(body: Record<string, unknown>) {
  const quantityMode = parseQuantityMode(body.quantityMode);
  const fixedQuantity = parseNumber(body.fixedQuantity, undefined);
  return {
    productId: castText(body.productId),
    serviceProductId: castText(body.serviceProductId),
    quantityMode,
    fixedQuantity: quantityMode === 'fixed' ? Math.max(0, fixedQuantity ?? 0) : undefined,
    isDefault: parseBoolean(body.isDefault, true),
    sortOrder: parseNumber(body.sortOrder, 0) ?? 0,
    note: castText(body.note),
  };
}

export async function getProductServiceLinks(req: Request, res: Response) {
  try {
    const productId = castText(req.query.productId);
    if (!productId) {
      return res.fail('Parameter productId je obvezen.', 400);
    }

    const links = await ProductServiceLinkModel.find({ productId })
      .populate('serviceProductId', 'ime prodajnaCena isService')
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    res.success(links.map((link) => toResponse(link as any)));
  } catch (_error) {
    res.fail('Ne morem pridobiti povezanih storitev.');
  }
}

export async function createProductServiceLink(req: Request, res: Response) {
  try {
    const payload = buildPayload(req.body ?? {});
    await validateProducts(payload.productId, payload.serviceProductId);
    const created = await ProductServiceLinkModel.create(payload);
    const populated = await ProductServiceLinkModel.findById(created._id)
      .populate('serviceProductId', 'ime prodajnaCena isService')
      .lean();

    res.success(populated ? toResponse(populated as any) : toResponse(created as any), 201);
  } catch (error) {
    res.fail(error instanceof Error ? error.message : 'Napaka pri dodajanju povezane storitve.', 400);
  }
}

export async function updateProductServiceLink(req: Request, res: Response) {
  try {
    const payload = buildPayload(req.body ?? {});
    await validateProducts(payload.productId, payload.serviceProductId);

    const updated = await ProductServiceLinkModel.findByIdAndUpdate(req.params.id, payload, { new: true })
      .populate('serviceProductId', 'ime prodajnaCena isService')
      .lean();

    if (!updated) {
      return res.fail('Povezava ne obstaja.', 404);
    }

    res.success(toResponse(updated as any));
  } catch (error) {
    res.fail(error instanceof Error ? error.message : 'Napaka pri posodabljanju povezane storitve.', 400);
  }
}

export async function deleteProductServiceLink(req: Request, res: Response) {
  try {
    const deleted = await ProductServiceLinkModel.findByIdAndDelete(req.params.id).lean();
    if (!deleted) {
      return res.fail('Povezava ne obstaja.', 404);
    }
    res.success({ id: req.params.id });
  } catch (_error) {
    res.fail('Napaka pri brisanju povezane storitve.');
  }
}
