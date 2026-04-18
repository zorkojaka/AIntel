import { Request, Response, NextFunction } from 'express';
import { WorkOrderModel } from '../schemas/work-order';
import { deleteFile } from '../../../utils/fileUpload';

type ExecutionUnitRecord = {
  id?: unknown;
  get?: (path: string) => unknown;
  unitPhotos?: string[];
  prepPhotos?: string[];
};

function normalizeExecutionUnitId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asExecutionUnitRecord(unit: unknown): ExecutionUnitRecord | null {
  if (!unit || typeof unit !== 'object') {
    return null;
  }
  return unit as ExecutionUnitRecord;
}

function readExecutionUnitId(unit: ExecutionUnitRecord | null): unknown {
  if (!unit) {
    return '';
  }

  return unit.id ?? unit.get?.('id') ?? '';
}

function parsePhotoType(rawType: unknown): 'unitPhotos' | 'prepPhotos' | null {
  if (rawType === 'prep') return 'prepPhotos';
  if (rawType === undefined || rawType === null || rawType === '' || rawType === 'unit') return 'unitPhotos';
  return null;
}

function findExecutionUnit(workOrder: { items: Array<{ executionSpec?: { executionUnits?: unknown[] } }> }, targetUnitId: string) {
  console.log('Looking for unitId:', targetUnitId);
  for (const item of workOrder.items) {
    const units = item.executionSpec?.executionUnits ?? [];
    for (const rawUnit of units) {
      const unit = asExecutionUnitRecord(rawUnit);
      const storedId = readExecutionUnitId(unit);
      console.log('Found unit id:', storedId, typeof storedId);
      const match = String(storedId) === String(targetUnitId);
      if (match && unit) {
        return unit;
      }
    }
  }
  return null;
}

/**
 * POST /projects/:projectId/work-orders/:workOrderId/execution-units/:unitId/photos
 * Save photo URL to execution unit
 */
export async function saveExecutionUnitPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, workOrderId, unitId } = req.params;
    const { photoUrl } = req.body;
    const targetUnitId = normalizeExecutionUnitId(unitId);
    const photoType = parsePhotoType(req.query?.type);

    if (!photoUrl || typeof photoUrl !== 'string') {
      return res.fail('photoUrl is required', 400);
    }

    if (!photoType) {
      return res.fail('Query param "type" must be "unit" or "prep"', 400);
    }

    const workOrder = await WorkOrderModel.findOne({ _id: workOrderId, projectId });
    console.log('WorkOrder found:', !!workOrder, 'items count:', workOrder?.items?.length);
    if (!workOrder) {
      return res.fail('Delovni nalog ni najden.', 404);
    }

    const unit = findExecutionUnit(workOrder, targetUnitId);
    if (!unit) {
      return res.fail('Execution unit not found', 404);
    }
    let updatedPhotos: string[] = [];

    // Initialize arrays if they don't exist
    if (!unit.unitPhotos) {
      unit.unitPhotos = [];
    }
    if (!unit.prepPhotos) {
      unit.prepPhotos = [];
    }

    // Add photo URL to the appropriate array
    if (photoType === 'unitPhotos') {
      if (!unit.unitPhotos.includes(photoUrl)) {
        unit.unitPhotos.push(photoUrl);
      }
      updatedPhotos = [...unit.unitPhotos];
    } else {
      if (!unit.prepPhotos.includes(photoUrl)) {
        unit.prepPhotos.push(photoUrl);
      }
      updatedPhotos = [...unit.prepPhotos];
    }

    // Save the work order
    await workOrder.save();

    return res.success({
      message: 'Photo saved successfully',
      unitId,
      photoUrl,
      photoType: req.query?.type ?? 'unit',
      photos: updatedPhotos,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /projects/:projectId/work-orders/:workOrderId/execution-units/:unitId/photos
 * Remove photo URL from execution unit and delete the uploaded file
 */
export async function deleteExecutionUnitPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, workOrderId, unitId } = req.params;
    const targetUnitId = normalizeExecutionUnitId(unitId);
    const encodedPhotoUrl = req.params.photoUrl;
    const photoType = parsePhotoType(req.query?.type);
    const photoUrl = typeof encodedPhotoUrl === 'string' ? decodeURIComponent(encodedPhotoUrl) : null;

    if (!photoUrl) {
      return res.fail('photoUrl is required', 400);
    }

    if (!photoType) {
      return res.fail('Query param "type" must be "unit" or "prep"', 400);
    }

    const workOrder = await WorkOrderModel.findOne({ _id: workOrderId, projectId });
    console.log('WorkOrder found:', !!workOrder, 'items count:', workOrder?.items?.length);
    if (!workOrder) {
      return res.fail('Delovni nalog ni najden.', 404);
    }

    const unit = findExecutionUnit(workOrder, targetUnitId);
    if (!unit) {
      return res.fail('Execution unit not found', 404);
    }
    let photoRemoved = false;
    let updatedPhotos: string[] = [];

    if (photoType === 'unitPhotos') {
      const initialLength = unit.unitPhotos?.length ?? 0;
      unit.unitPhotos = (unit.unitPhotos ?? []).filter((entry) => entry !== photoUrl);
      photoRemoved = (unit.unitPhotos?.length ?? 0) !== initialLength;
      updatedPhotos = [...(unit.unitPhotos ?? [])];
    } else {
      const initialLength = unit.prepPhotos?.length ?? 0;
      unit.prepPhotos = (unit.prepPhotos ?? []).filter((entry) => entry !== photoUrl);
      photoRemoved = (unit.prepPhotos?.length ?? 0) !== initialLength;
      updatedPhotos = [...(unit.prepPhotos ?? [])];
    }

    if (!photoRemoved) {
      return res.fail('Photo not found on execution unit', 404);
    }

    await workOrder.save();
    deleteFile(photoUrl);

    return res.success({
      message: 'Photo deleted successfully',
      unitId,
      photoUrl,
      photoType: req.query?.type ?? 'unit',
      photos: updatedPhotos,
    });
  } catch (err) {
    next(err);
  }
}
