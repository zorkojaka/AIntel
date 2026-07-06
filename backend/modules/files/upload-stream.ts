import fs from 'node:fs/promises';
import path from 'node:path';

import type { NextFunction, Request, Response } from 'express';

const UPLOAD_BASE_DIR = '/var/www/aintel/uploads';
const RESOLVED_UPLOAD_BASE_DIR = path.resolve(UPLOAD_BASE_DIR);

export type UploadPathResolution =
  | { ok: true; absolutePath: string }
  | { ok: false; status: 400 | 403; message: string };

export function resolveUploadPath(relativePath: string, baseDir = RESOLVED_UPLOAD_BASE_DIR): UploadPathResolution {
  if (relativePath.includes('\0')) {
    return { ok: false, status: 400, message: 'Neveljavna pot datoteke.' };
  }

  const normalizedRelativePath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedRelativePath || normalizedRelativePath.split('/').some((part) => part === '..')) {
    return { ok: false, status: 403, message: 'Ni dostopa do datoteke.' };
  }

  const resolvedBase = path.resolve(baseDir);
  const absolutePath = path.resolve(resolvedBase, normalizedRelativePath);
  const relativeToBase = path.relative(resolvedBase, absolutePath);
  if (!relativeToBase || relativeToBase.startsWith('..') || path.isAbsolute(relativeToBase)) {
    return { ok: false, status: 403, message: 'Ni dostopa do datoteke.' };
  }

  return { ok: true, absolutePath };
}

export async function streamUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const wildcardPath = req.params[0];
    const relativePath = typeof wildcardPath === 'string' ? wildcardPath : '';
    const resolved = resolveUploadPath(relativePath);

    if (resolved.ok === false) {
      return (res as any).fail(resolved.message, resolved.status);
    }

    const fileStat = await fs.stat(resolved.absolutePath).catch(() => null);
    if (!fileStat?.isFile()) {
      return (res as any).fail('Datoteka ni najdena.', 404);
    }

    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(resolved.absolutePath);
  } catch (error) {
    next(error);
  }
}
