import mongoose from 'mongoose';
import { ProductModel } from '../../cenik/product.model';
import { EmployeeServiceRateModel } from '../schemas/employee-service-rate';

export interface EmployeeServiceRateInput {
  serviceProductId: string;
  defaultPercent: number;
  overridePrice?: number | null;
  isActive?: boolean;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeRate(doc: unknown) {
  const plain = doc && typeof doc === 'object' && 'toObject' in (doc as Record<string, unknown>)
    ? (doc as { toObject: () => Record<string, unknown> }).toObject()
    : (doc as Record<string, unknown>);
  return {
    id: String(plain._id ?? plain.id ?? ''),
    employeeId: String(plain.employeeId ?? ''),
    serviceProductId: String(plain.serviceProductId ?? ''),
    defaultPercent: toNumber(plain.defaultPercent, 0),
    overridePrice: plain.overridePrice === null || plain.overridePrice === undefined ? null : toNumber(plain.overridePrice, 0),
    isActive: Boolean(plain.isActive ?? true),
    createdAt: plain.createdAt instanceof Date ? plain.createdAt.toISOString() : String(plain.createdAt ?? ''),
    updatedAt: plain.updatedAt instanceof Date ? plain.updatedAt.toISOString() : String(plain.updatedAt ?? ''),
  };
}

async function ensureServiceProduct(productId: string) {
  const product = await ProductModel.findById(productId).lean();
  if (!product) {
    throw new Error(`Produkt ${productId} ne obstaja.`);
  }
  if (!product.isService) {
    throw new Error(`Produkt ${productId} ni storitev.`);
  }
}

export async function listEmployeeServiceRates(employeeId: string) {
  const rates = await EmployeeServiceRateModel.find({ employeeId }).sort({ createdAt: -1 }).lean();
  return rates.map((rate) => sanitizeRate(rate));
}

export async function bulkUpsertEmployeeServiceRates(employeeId: string, inputs: EmployeeServiceRateInput[]) {
  const normalized = inputs.filter((entry) => entry && mongoose.isValidObjectId(entry.serviceProductId));
  for (const entry of normalized) {
    await ensureServiceProduct(entry.serviceProductId);
  }

  await Promise.all(
    normalized.map((entry) =>
      EmployeeServiceRateModel.findOneAndUpdate(
        { employeeId, serviceProductId: entry.serviceProductId },
        {
          $set: {
            defaultPercent: toNumber(entry.defaultPercent, 0),
            overridePrice: entry.overridePrice === null || entry.overridePrice === undefined ? null : toNumber(entry.overridePrice, 0),
            isActive: entry.isActive !== false,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  );

  return listEmployeeServiceRates(employeeId);
}

export async function copyEmployeeServiceRates(employeeId: string, sourceEmployeeId: string) {
  const sourceRates = await EmployeeServiceRateModel.find({ employeeId: sourceEmployeeId }).lean();
  await Promise.all(
    sourceRates.map((rate) =>
      EmployeeServiceRateModel.findOneAndUpdate(
        { employeeId, serviceProductId: String(rate.serviceProductId) },
        {
          $set: {
            defaultPercent: toNumber(rate.defaultPercent, 0),
            overridePrice: rate.overridePrice === null || rate.overridePrice === undefined ? null : toNumber(rate.overridePrice, 0),
            isActive: Boolean(rate.isActive ?? true),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    )
  );

  return listEmployeeServiceRates(employeeId);
}
