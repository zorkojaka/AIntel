import { RequestHandler } from 'express';
import { normalizeUnicode } from '../../utils/normalizeUnicode';

export const normalizePayload: RequestHandler = (req, _res, next) => {
  req.body = normalizeUnicode(req.body);
  req.query = normalizeUnicode(req.query);
  req.params = normalizeUnicode(req.params);
  next();
};
