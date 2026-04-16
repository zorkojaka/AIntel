import { Request, Response, NextFunction } from 'express';
import { WorkOrderModel } from '../schemas/work-order';
import { deleteFile } from '../../../utils/fileUpload';

function normalizeExecutionUnitId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readExecutionUnitId(unit: unknown): string {
  if (!unit || typeof unit !== 'object') {
    return '';
  }

  const candidate = unit as { id?: unknown; get?: (path: string) => unknown };
  const directId = normalizeExecutionUnitId(candidate.id);
  if (directId) {
    return directId;
  }

  if (typeof candidate.get === 'function') {
    return normalizeExecutionUnitId(candidate.get('id'));
  }

  return '';
}

function collectExecutionUnitIds(workOrder: { items?: unknown[] }): string[] {
  const ids: string[] = [];

  if (!Array.isArray(workOrder.items)) {
    return ids;
  }

  for (const item of workOrder.items) {
    if (!item || typeof item !== 'object') continue;
    const executionSpec = (item as { executionSpec?: { executionUnits?: unknown[] } }).executionSpec;
    if (!Array.isArray(executionSpec?.executionUnits)) continue;

    for (const unit of executionSpec.executionUnits) {
      const executionUnitId = readExecutionUnitId(unit);
      if (executionUnitId) {
        ids.push(executionUnitId);
      }
    }
  }

  return ids;
}

/**
 * POST /projects/:projectId/work-orders/:workOrderId/execution-units/:unitId/photos
 * Save photo URL to execution unit
 */
export async function saveExecutionUnitPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, workOrderId, unitId } = req.params;
    const { photoUrl, photoType } = req.body;
    const targetUnitId = normalizeExecutionUnitId(unitId);

    if (!photoUrl || typeof photoUrl !== 'string') {
      return res.fail('photoUrl is required', 400);
    }

    if (!photoType || (photoType !== 'unitPhotos' && photoType !== 'prepPhotos')) {
      return res.fail('photoType must be either "unitPhotos" or "prepPhotos"', 400);
    }

    const workOrder = await WorkOrderModel.findOne({ _id: workOrderId, projectId });
    if (!workOrder) {
      return res.fail('Delovni nalog ni najden.', 404);
    }

    const allExecutionUnitIds = collectExecutionUnitIds(workOrder);
    console.log(
      '[execution-unit-photos] upload lookup',
      JSON.stringify({
        projectId,
        workOrderId,
        requestedUnitId: targetUnitId,
        knownUnitIds: allExecutionUnitIds,
      })
    );

    // Find the unit across all items -> executionSpec -> executionUnits
    const matchingEntry = workOrder.items
      .flatMap((item) => item.executionSpec?.executionUnits ?? [])
      .map((unit) => ({ unit, unitId: readExecutionUnitId(unit) }))
      .find(({ unitId }) => unitId === targetUnitId);

    if (!matchingEntry?.unit) {
      return res.fail('Execution unit not found', 404);
    }
    const unit = matchingEntry.unit;
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
      photoType,
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
    const photoUrlValue = req.body?.photoUrl ?? req.query?.photoUrl;
    const photoTypeValue = req.body?.photoType ?? req.query?.photoType;
    const photoUrl = typeof photoUrlValue === 'string' ? photoUrlValue : null;
    const photoType = typeof photoTypeValue === 'string' ? photoTypeValue : null;

    if (!photoUrl) {
      return res.fail('photoUrl is required', 400);
    }

    if (photoType !== 'unitPhotos' && photoType !== 'prepPhotos') {
      return res.fail('photoType must be either "unitPhotos" or "prepPhotos"', 400);
    }

    const workOrder = await WorkOrderModel.findOne({ _id: workOrderId, projectId });
    if (!workOrder) {
      return res.fail('Delovni nalog ni najden.', 404);
    }

    const allExecutionUnitIds = collectExecutionUnitIds(workOrder);
    console.log(
      '[execution-unit-photos] delete lookup',
      JSON.stringify({
        projectId,
        workOrderId,
        requestedUnitId: targetUnitId,
        knownUnitIds: allExecutionUnitIds,
      })
    );

    const matchingEntry = workOrder.items
      .flatMap((item) => item.executionSpec?.executionUnits ?? [])
      .map((unit) => ({ unit, unitId: readExecutionUnitId(unit) }))
      .find(({ unitId }) => unitId === targetUnitId);

    if (!matchingEntry?.unit) {
      return res.fail('Execution unit not found', 404);
    }
    const unit = matchingEntry.unit;
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
      photoType,
      photos: updatedPhotos,
    });
  } catch (err) {
    next(err);
  }
}
