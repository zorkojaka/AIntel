import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const MAIN_MAX_DIMENSION = 1920;
const THUMB_MAX_DIMENSION = 400;
const MAIN_JPEG_QUALITY = 85;
const THUMB_JPEG_QUALITY = 75;

export interface ProcessedImageResult {
  filename: string;
  thumbnailFilename: string;
  mainPath: string;
  thumbnailPath: string;
  size: number;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
}

export function sanitizeImageBaseName(originalName: string) {
  const parsed = path.parse(originalName || 'photo');
  const base = parsed.name || 'photo';
  return base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'photo';
}

export async function processImage(inputPath: string, outputDir: string, filenameBase: string): Promise<ProcessedImageResult> {
  await fs.mkdir(outputDir, { recursive: true });

  const filename = `${filenameBase}.jpg`;
  const thumbnailFilename = `${filenameBase}-thumb.jpg`;
  const mainPath = path.join(outputDir, filename);
  const thumbnailPath = path.join(outputDir, thumbnailFilename);

  try {
    await sharp(inputPath, { failOn: 'none' })
      .rotate()
      .resize({
        width: MAIN_MAX_DIMENSION,
        height: MAIN_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: MAIN_JPEG_QUALITY, mozjpeg: true })
      .toFile(mainPath);

    await sharp(inputPath, { failOn: 'none' })
      .rotate()
      .resize({
        width: THUMB_MAX_DIMENSION,
        height: THUMB_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
      .toFile(thumbnailPath);

    const [metadata, stat] = await Promise.all([sharp(mainPath).metadata(), fs.stat(mainPath)]);

    if (!metadata.width || !metadata.height) {
      throw new Error('Processed image dimensions are unavailable.');
    }

    return {
      filename,
      thumbnailFilename,
      mainPath,
      thumbnailPath,
      size: stat.size,
      width: metadata.width,
      height: metadata.height,
      mimeType: 'image/jpeg',
    };
  } catch (error) {
    await Promise.allSettled([fs.unlink(mainPath), fs.unlink(thumbnailPath)]);
    throw error;
  }
}
