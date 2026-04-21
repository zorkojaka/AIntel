import multer from 'multer';
import path from 'path';
import fs from 'fs';

export const UPLOAD_BASE_DIR = process.env.UPLOAD_BASE_DIR ?? '/var/www/aintel/uploads';

// Allowed image MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Ensure directory exists, create if not
 */
function ensureDirectoryExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Configure multer storage
 * Files are saved to: /var/www/aintel/uploads/{entityType}/{entityId}/
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const entityType = req.body.entityType || 'general';
    const entityId = req.body.entityId || 'default';
    const uploadDir = path.join(UPLOAD_BASE_DIR, entityType, entityId);
    
    try {
      ensureDirectoryExists(uploadDir);
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}-${sanitizedOriginalName}`;
    cb(null, filename);
  },
});

/**
 * File filter to accept only images
 */
const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${ALLOWED_MIME_TYPES.join(', ')} are allowed.`));
  }
};

/**
 * Multer upload middleware configuration
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

/**
 * Build relative file URL from absolute path
 */
export function buildFileUrl(absolutePath: string): string {
  return absolutePath.replace(UPLOAD_BASE_DIR, '/uploads');
}

/**
 * Build absolute path from relative URL
 */
export function buildAbsolutePath(fileUrl: string): string {
  return fileUrl.replace('/uploads', UPLOAD_BASE_DIR);
}

/**
 * Delete file from filesystem
 */
export function deleteFile(fileUrl: string): boolean {
  try {
    const absolutePath = buildAbsolutePath(fileUrl);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}
