import { Request, Response, NextFunction } from 'express';
import { WorkOrderModel } from '../schemas/work-order';

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
