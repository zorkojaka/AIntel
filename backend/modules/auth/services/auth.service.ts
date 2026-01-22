import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { authCookieName } from '../../../middlewares/auth';

const DEFAULT_JWT_SECRET = 'aintel_dev_secret';

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function generateTokenPair(expiresInMs: number) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + expiresInMs);
  return { token, tokenHash, expiresAt };
}

export function getJwtSecret() {
  return process.env.AINTEL_JWT_SECRET || DEFAULT_JWT_SECRET;
}

export function getJwtDays() {
  const raw = process.env.AINTEL_JWT_EXPIRES_DAYS;
  const parsed = raw ? Number(raw) : 7;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

export function signSessionToken(payload: { userId: string; tenantId: string }) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: `${getJwtDays()}d` });
}

export function getSessionCookieOptions() {
  const days = getJwtDays();
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}

export function clearSessionCookie(res: any) {
  res.clearCookie(authCookieName, getSessionCookieOptions());
}

export function setSessionCookie(res: any, token: string) {
  res.cookie(authCookieName, token, getSessionCookieOptions());
}
