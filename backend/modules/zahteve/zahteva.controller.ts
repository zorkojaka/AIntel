import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { resolveActorId } from '../../utils/tenant';
import { resolveTenantId } from '../../utils/tenant';
import { ProjectModel } from '../projects/schemas/project';
import { ZahtevaModel } from './zahteva.model';
import {
  createDefaultVideonadzorSystem,
  izracunajInPredlagajDisk,
  nadaljujNaPonudbo,
  predlagajDisk,
  predlagajNosilce,
  predlagajPoESwitch,
  predlagajSnemalnik,
  resolveProjectForZahteva,
} from './zahteva.service';

function isObjectId(value: unknown) {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

function actorObjectId(req: Request) {
  const actorId = resolveActorId(req);
  return actorId && mongoose.isValidObjectId(actorId) ? actorId : null;
}

function executionFromLegacyMontaza(montaza: any) {
  const metrov = Math.max(0, Number(montaza?.metrov) || 0);
  if (!montaza?.vkljuceno) {
    return { scenarioType: 'posiljanje', estimates: { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0 } };
  }
  if (!montaza?.napeljava) {
    return { scenarioType: 'izvedba', estimates: { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0 } };
  }
  return {
    scenarioType: 'izvedba_napeljava',
    estimates: {
      napeljavaUr: 0,
      utpKabelMetrov: metrov,
      kanalMetrov: montaza?.zascitniMaterial === 'kanal' ? metrov : 0,
    },
  };
}

function sanitizeIncomingZahtevaPayload(payload: any) {
  const next = { ...(payload ?? {}) };
  if ('execution' in next) delete next.execution;
  if (Array.isArray(next.sistemi)) {
    next.sistemi = next.sistemi.map((sistem: any) => {
      const cleanSistem = { ...sistem };
      if (cleanSistem.videonadzor?.montaza) {
        cleanSistem.execution = cleanSistem.execution ?? executionFromLegacyMontaza(cleanSistem.videonadzor.montaza);
        const { montaza: _montaza, ...videonadzor } = cleanSistem.videonadzor;
        cleanSistem.videonadzor = videonadzor;
      }
      return cleanSistem;
    });
  }
  return next;
}

export async function createZahteva(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = String(req.body?.projectId ?? '').trim();
    if (!projectId) return res.fail('Manjka projectId.', 400);

    const project = await resolveProjectForZahteva(projectId);
    if (!project) return res.fail('Projekt ni najden.', 404);

    const activeRequestId = (project as any).activeRequestId;
    if (activeRequestId && mongoose.isValidObjectId(activeRequestId)) {
      const existing = await ZahtevaModel.findById(activeRequestId);
      if (existing) return res.success(existing);
    }

    const payload = sanitizeIncomingZahtevaPayload(req.body);
    const sistemi = Array.isArray(payload?.sistemi) && payload.sistemi.length > 0
      ? payload.sistemi
      : [createDefaultVideonadzorSystem()];

    const zahteva = await ZahtevaModel.create({
      projectId: project._id,
      status: 'osnutek',
      sistemi,
      createdBy: actorObjectId(req),
    });

    await ProjectModel.updateOne(
      { _id: project._id },
      {
        $addToSet: { requestIds: zahteva._id },
        $set: { activeRequestId: zahteva._id },
      }
    );

    return res.success(zahteva, 201);
  } catch (error) {
    next(error);
  }
}

export async function getZahteva(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isObjectId(req.params.id)) return res.fail('Neveljavna zahteva.', 400);
    const zahteva = await ZahtevaModel.findById(req.params.id).lean();
    if (!zahteva) return res.fail('Zahteva ni najdena.', 404);
    return res.success(zahteva);
  } catch (error) {
    next(error);
  }
}

export async function updateZahteva(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isObjectId(req.params.id)) return res.fail('Neveljavna zahteva.', 400);
    const blocked = new Set(['_id', 'projectId', 'createdBy', 'createdAt', 'updatedAt', 'generatedQuoteId']);
    const payload = sanitizeIncomingZahtevaPayload(req.body);
    const update = Object.fromEntries(Object.entries(payload ?? {}).filter(([key]) => !blocked.has(key)));
    const zahteva = await ZahtevaModel.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!zahteva) return res.fail('Zahteva ni najdena.', 404);
    return res.success(zahteva);
  } catch (error) {
    next(error);
  }
}

export async function nadaljujZahtevaNaPonudbo(req: Request, res: Response, next: NextFunction) {
  try {
    const ponudba = await nadaljujNaPonudbo(req.params.id, resolveTenantId(req) ?? 'inteligent');
    return res.success(ponudba);
  } catch (error: any) {
    if (error?.statusCode) return res.fail(error.message, error.statusCode);
    next(error);
  }
}

export async function deleteZahteva(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isObjectId(req.params.id)) return res.fail('Neveljavna zahteva.', 400);
    const zahteva = await ZahtevaModel.findById(req.params.id);
    if (!zahteva) return res.fail('Zahteva ni najdena.', 404);
    if (zahteva.status !== 'osnutek') return res.fail('Izbris je dovoljen samo za osnutek zahteve.', 400);

    await ProjectModel.updateOne(
      { _id: zahteva.projectId },
      { $pull: { requestIds: zahteva._id }, $unset: { activeRequestId: '' } }
    );
    await zahteva.deleteOne();
    return res.success({ id: req.params.id });
  } catch (error) {
    next(error);
  }
}

export async function getPredlogSnemalnik(req: Request, res: Response, next: NextFunction) {
  try {
    const kanali = Number(req.query.kanali ?? req.query.skpajKamer ?? 0);
    const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
    const poe = String(req.query.poe ?? '').toLowerCase() === 'true';
    const product = await predlagajSnemalnik(kanali, brand, poe);
    return res.success(product);
  } catch (error) {
    next(error);
  }
}

export async function getPredlogSwitch(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await predlagajPoESwitch(Number(req.query.portov ?? 0));
    return res.success(product);
  } catch (error) {
    next(error);
  }
}

export async function getPredlogDisk(req: Request, res: Response, next: NextFunction) {
  try {
    const cameraIds = typeof req.query.cameraIds === 'string'
      ? req.query.cameraIds.split(',').map((id) => id.trim()).filter(Boolean)
      : [];
    if (cameraIds.length > 0) {
      const result = await izracunajInPredlagajDisk({
        cameraIds,
        savingDays: Number(req.query.dni ?? req.query.savingDays ?? 30),
        motionRecord: String(req.query.motion ?? req.query.motionRecord ?? '').toLowerCase() === 'true',
      });
      return res.success(result);
    }

    const surveillance = String(req.query.surveillance ?? 'true').toLowerCase() !== 'false';
    const product = await predlagajDisk(Number(req.query.tb ?? 0), surveillance);
    return res.success(product);
  } catch (error) {
    next(error);
  }
}

export async function getPredlogNosilci(req: Request, res: Response, next: NextFunction) {
  try {
    const kameraId = String(req.query.kameraId ?? '').trim();
    if (!kameraId) return res.fail('Manjka kameraId.', 400);
    const products = await predlagajNosilce(kameraId);
    return res.success(products);
  } catch (error) {
    next(error);
  }
}
