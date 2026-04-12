import { Request, Response, NextFunction } from 'express';
import { buildFileUrl, deleteFile } from '../../utils/fileUpload';

/**
 * Handle file upload
 * POST /api/files/upload
 */
export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const fileUrl = buildFileUrl(req.file.path);
    const filename = req.file.filename;

    return res.json({
      success: true,
      data: {
        fileUrl,
        filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Handle file deletion
 * DELETE /api/files/:filename
 */
export async function deleteFileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { filename } = req.params;
    const { entityType, entityId } = req.query;

    if (!filename || !entityType || !entityId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: filename, entityType, entityId',
      });
    }

    // Build the file URL from the parameters
    const fileUrl = `/uploads/${entityType}/${entityId}/${filename}`;
    const deleted = deleteFile(fileUrl);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'File not found or could not be deleted',
      });
    }

    return res.json({
      success: true,
      data: {
        message: 'File deleted successfully',
        filename,
      },
    });
  } catch (error) {
    next(error);
  }
}
