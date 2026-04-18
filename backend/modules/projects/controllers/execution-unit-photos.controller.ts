import { Request, Response, NextFunction } from 'express';
import { WorkOrderModel } from '../schemas/work-order';
import { deleteFile } from '../../../utils/fileUpload';

interface WorkOrderExecutionUnit {
  id: string;
  unitPhotos?: string[];
  prepPhotos?: string[];
  get?: (path: string) => unknown;
}

function normalizeExecutionUnitId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readExecutionUnitId(unit: WorkOrderExecutionUnit): string {
  if (!unit || typeof unit !== 'object') {
    return '';
  }

  const directId = normalizeExecutionUnitId(unit.id);
  if (directId) {
    return directId;
  }

  if (typeof unit.get === 'function') {
    return normalizeExecutionUnitId(unit.get('id'));
  }

  return '';
}

function parsePhotoType(rawType: unknown): 'unitPhotos' | 'prepPhotos' | null {
  if (rawType === 'prep') return 'prepPhotos';
  if (rawType === undefined || rawType === null || rawType === '' || rawType === 'unit') return 'unitPhotos';
  return null;
}

function findExecutionUnit(workOrder: { items: Array<{ executionSpec?: { executionUnits?: WorkOrderExecutionUnit[] } }> }, targetUnitId: string): WorkOrderExecutionUnit | null {
  for (const item of workOrder.items) {
    const units = item.executionSpec?.executionUnits ?? [];
    for (const unit of units) {
      const unitId = readExecutionUnitId(unit);
      console.log('[execution-unit-photos] compare', JSON.stringify({ requestedUnitId: targetUnitId, candidateUnitId: unitId }));
      if (unitId === targetUnitId) {
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
    if (!workOrder) {
      return res.fail('Delovni nalog ni najden.', 404);
    }

    const foundUnit = findExecutionUnit(workOrder, targetUnitId);
    if (!foundUnit) {
      return res.fail('Execution unit not found', 404);
    }
    const typedUnit = foundUnit as WorkOrderExecutionUnit;
    let updatedPhotos: string[] = [];

    // Initialize arrays if they don't exist
    if (!typedUnit.unitPhotos) {
      typedUnit.unitPhotos = [];
    }
    if (!typedUnit.prepPhotos) {
      typedUnit.prepPhotos = [];
    }

    // Add photo URL to the appropriate array
    if (photoType === 'unitPhotos') {
      if (!typedUnit.unitPhotos.includes(photoUrl)) {
        typedUnit.unitPhotos.push(photoUrl);
      }
      updatedPhotos = [...typedUnit.unitPhotos];
    } else {
      if (!typedUnit.prepPhotos.includes(photoUrl)) {
        typedUnit.prepPhotos.push(photoUrl);
      }
      updatedPhotos = [...typedUnit.prepPhotos];
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
    if (!workOrder) {
      return res.fail('Delovni nalog ni najden.', 404);
    }

    const foundUnit = findExecutionUnit(workOrder, targetUnitId);
    if (!foundUnit) {
      return res.fail('Execution unit not found', 404);
    }
    const typedUnit = foundUnit as WorkOrderExecutionUnit;
    let photoRemoved = false;
    let updatedPhotos: string[] = [];

    if (photoType === 'unitPhotos') {
      const initialLength = typedUnit.unitPhotos?.length ?? 0;
      typedUnit.unitPhotos = (typedUnit.unitPhotos ?? []).filter((entry) => entry !== photoUrl);
      photoRemoved = (typedUnit.unitPhotos?.length ?? 0) !== initialLength;
      updatedPhotos = [...(typedUnit.unitPhotos ?? [])];
    } else {
      const initialLength = typedUnit.prepPhotos?.length ?? 0;
      typedUnit.prepPhotos = (typedUnit.prepPhotos ?? []).filter((entry) => entry !== photoUrl);
      photoRemoved = (typedUnit.prepPhotos?.length ?? 0) !== initialLength;
      updatedPhotos = [...(typedUnit.prepPhotos ?? [])];
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
