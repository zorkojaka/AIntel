import { Request, Response, NextFunction } from 'express';
import { deleteFile } from '../../../utils/fileUpload';
import { WorkOrderModel, type WorkOrderPhoto } from '../schemas/work-order';

type PhotoType = WorkOrderPhoto['type'];

function parsePhotoType(value: unknown): PhotoType | null {
  return value === 'unit' || value === 'prep' ? value : null;
}

function parseIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function serializePhoto(photo: WorkOrderPhoto) {
  return {
    _id: photo._id ? String(photo._id) : '',
    id: photo._id ? String(photo._id) : '',
    url: photo.url,
    type: photo.type,
    itemIndex: photo.itemIndex,
    unitIndex: photo.unitIndex,
    uploadedAt: photo.uploadedAt ? new Date(photo.uploadedAt).toISOString() : new Date().toISOString(),
  };
}

function serializePhotos(photos: WorkOrderPhoto[] | undefined) {
  return (photos ?? []).map(serializePhoto);
}

export async function saveWorkOrderPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, workOrderId } = req.params;
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const type = parsePhotoType(req.body?.type);
    const itemIndex = parseIndex(req.body?.itemIndex);
    const unitIndex = parseIndex(req.body?.unitIndex);

    if (!url) {
      return res.fail('url is required', 400);
    }
    if (!type) {
      return res.fail('type must be "unit" or "prep"', 400);
    }
    if (itemIndex === null) {
      return res.fail('itemIndex must be a non-negative integer', 400);
    }
    if (unitIndex === null) {
      return res.fail('unitIndex must be a non-negative integer', 400);
    }

    const workOrder = await WorkOrderModel.findOne({ _id: workOrderId, projectId });
    if (!workOrder) {
      return res.fail('Delovni nalog ni najden.', 404);
    }

    if (!Array.isArray(workOrder.photos)) {
      workOrder.photos = [];
    }

    const existingPhoto = workOrder.photos.find(
      (photo) =>
        photo.url === url &&
        photo.type === type &&
        photo.itemIndex === itemIndex &&
        photo.unitIndex === unitIndex,
    );

    if (!existingPhoto) {
      workOrder.photos.push({
        url,
        type,
        itemIndex,
        unitIndex,
        uploadedAt: new Date(),
      });
      await workOrder.save();
    }
    const photo = existingPhoto ?? workOrder.photos[workOrder.photos.length - 1];

    return res.success({
      message: 'Photo saved successfully',
      photo: serializePhoto(photo),
      photos: serializePhotos(workOrder.photos),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteWorkOrderPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, workOrderId, photoId } = req.params;
    const workOrder = await WorkOrderModel.findOne({ _id: workOrderId, projectId });
    if (!workOrder) {
      return res.fail('Delovni nalog ni najden.', 404);
    }

    if (!Array.isArray(workOrder.photos)) {
      workOrder.photos = [];
    }

    const photo = workOrder.photos.find((candidate) => String(candidate._id) === String(photoId));
    if (!photo) {
      return res.fail('Photo not found on work order', 404);
    }

    const photoUrl = photo.url;
    workOrder.photos = workOrder.photos.filter((candidate) => String(candidate._id) !== String(photoId));
    await workOrder.save();
    deleteFile(photoUrl);

    return res.success({
      message: 'Photo deleted successfully',
      photoId,
      photos: serializePhotos(workOrder.photos),
    });
  } catch (err) {
    next(err);
  }
}
