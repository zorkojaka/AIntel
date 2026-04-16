import { Request, Response, NextFunction } from 'express';
import { WorkOrderModel } from '../schemas/work-order';
import { deleteFile } from '../../../utils/fileUpload';

/**
 * POST /projects/:projectId/work-orders/:workOrderId/execution-units/:unitId/photos
 * Save photo URL to execution unit
 */
export async function saveExecutionUnitPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, workOrderId, unitId } = req.params;
    const { photoUrl, photoType } = req.body;

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

    // Find the item and execution unit
    let unitFound = false;
    for (const item of workOrder.items) {
      if (item.executionSpec?.executionUnits) {
        const unit = item.executionSpec.executionUnits.find((u) => u.id === unitId);
        if (unit) {
          unitFound = true;
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
          } else {
            if (!unit.prepPhotos.includes(photoUrl)) {
              unit.prepPhotos.push(photoUrl);
            }
          }
          break;
        }
      }
    }

    if (!unitFound) {
      return res.fail('Execution unit not found', 404);
    }

    // Save the work order
    await workOrder.save();

    return res.success({
      message: 'Photo saved successfully',
      unitId,
      photoUrl,
      photoType,
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

    let unitFound = false;
    let photoRemoved = false;

    for (const item of workOrder.items) {
      if (!item.executionSpec?.executionUnits) continue;
      const unit = item.executionSpec.executionUnits.find((executionUnit) => executionUnit.id === unitId);
      if (!unit) continue;

      unitFound = true;
      if (photoType === 'unitPhotos') {
        const initialLength = unit.unitPhotos?.length ?? 0;
        unit.unitPhotos = (unit.unitPhotos ?? []).filter((entry) => entry !== photoUrl);
        photoRemoved = (unit.unitPhotos?.length ?? 0) !== initialLength;
      } else {
        const initialLength = unit.prepPhotos?.length ?? 0;
        unit.prepPhotos = (unit.prepPhotos ?? []).filter((entry) => entry !== photoUrl);
        photoRemoved = (unit.prepPhotos?.length ?? 0) !== initialLength;
      }
      break;
    }

    if (!unitFound) {
      return res.fail('Execution unit not found', 404);
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
    });
  } catch (err) {
    next(err);
  }
}
