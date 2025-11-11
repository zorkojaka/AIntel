import { Request, Response } from 'express';
import { Types } from 'mongoose';
import '../../../core/response';
import { normalizeUnicode } from '../../../utils/normalizeUnicode';
import { ProjectDocuments, ProjectModel, ProjectStatus } from '../models/Project';
import { CrmCompanyModel } from '../../crm/schemas/company';
import { CrmPersonModel } from '../../crm/schemas/person';
import {
  TimelineEvent,
  TIMELINE_PHASES,
  ProjectPhase,
  TimelineStatus
} from '../models/TimelineEvent';

const STATUS_ORDER: ProjectStatus[] = ['draft', 'confirmed', 'scheduled', 'executed', 'completed'];

const phaseToDocumentKey: Record<ProjectPhase, keyof ProjectDocuments> = {
  offer: 'offerId',
  order: 'orderId',
  workOrder: 'workOrderId',
  deliveryNote: 'deliveryNoteId',
  invoice: 'invoiceId'
};

const phaseStatusMap: Record<ProjectPhase, ProjectStatus> = {
  offer: 'confirmed',
  order: 'confirmed',
  workOrder: 'scheduled',
  deliveryNote: 'executed',
  invoice: 'completed'
};

function ensureDocuments(documents?: ProjectDocuments): ProjectDocuments {
  return {
    offerId: documents?.offerId,
    orderId: documents?.orderId,
    workOrderId: documents?.workOrderId,
    deliveryNoteId: documents?.deliveryNoteId,
    invoiceId: documents?.invoiceId
  };
}

export function buildDefaultTimeline(): TimelineEvent[] {
  return TIMELINE_PHASES.map((phase) => ({
    phase,
    status: 'pending',
    confirmed: false
  }));
}

export function completeTimelinePhase(
  timeline: TimelineEvent[],
  phase: ProjectPhase,
  documentId: Types.ObjectId
) {
  let found = false;
  const updated = timeline.map((event) => {
    if (event.phase !== phase) return event;
    found = true;
    if (event.status === 'completed') {
      throw new Error(`Faza ${phase} je že potrjena`);
    }
    return {
      ...event,
      status: 'completed' as TimelineStatus,
      confirmed: true,
      documentId,
      createdAt: new Date()
    };
  });
  if (!found) {
    throw new Error(`Faza ${phase} ni definirana v časovnici`);
  }
  return updated;
}

function mapProjectResponse(project: any) {
  const company = project.company_id;
  const contact = project.contact_id;
  const companyName = company?.name ?? null;
  const contactName =
    contact && (contact.first_name || contact.last_name)
      ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
      : null;

  return {
    ...project,
    companyName,
    contactName,
    timeline: project.timeline ?? [],
    documents: ensureDocuments(project.documents)
  };
}

async function findProjectByParam(id: string) {
  if (Types.ObjectId.isValid(id)) {
    return ProjectModel.findById(id);
  }
  const numeric = Number(id);
  if (!Number.isNaN(numeric)) {
    return ProjectModel.findOne({ project_id: numeric });
  }
  return null;
}

export async function getProjects(req: Request, res: Response) {
  try {
    const query = normalizeUnicode(req.query);
    const filter: Record<string, unknown> = {};

    if (query.status) {
      filter.status = query.status;
    }
    if (query.company) {
      filter.company_id = query.company;
    }
    if (query.contact) {
      filter.contact_id = query.contact;
    }
    if (query.search) {
      const escaped = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ name: regex }, { description: regex }, { city: regex }];
    }

    const projects = await ProjectModel.find(filter)
      .sort({ createdAt: -1 })
      .populate('company_id', 'name')
      .populate('contact_id', 'first_name last_name')
      .lean();

    const mapped = projects.map(mapProjectResponse);
    res.success({ projects: mapped });
  } catch (error) {
    res.fail('Neuspelo pridobivanje projektov');
  }
}

export async function getProjectById(req: Request, res: Response) {
  try {
    const project = await findProjectByParam(req.params.id);
    if (!project) {
      return res.fail('Projekt ni najden', 404);
    }
    await project.populate('company_id', 'name');
    await project.populate('contact_id', 'first_name last_name');
    res.success(mapProjectResponse(project.toObject()));
  } catch (error) {
    res.fail('Ne morem naložiti projekta');
  }
}

export async function createProject(req: Request, res: Response) {
  try {
    const payload = normalizeUnicode(req.body);
    const {
      name,
      description,
      city,
      startDate,
      endDate,
      company_id,
      contact_id,
      notes
    } = payload;

    if (!name || !company_id || !contact_id) {
      return res.fail('Naziv, stranka in kontaktna oseba so obvezni');
    }

    const company = await CrmCompanyModel.findById(company_id);
    if (!company) {
      return res.fail('Izbrana stranka ne obstaja', 404);
    }

    const contact = await CrmPersonModel.findById(contact_id);
    if (!contact) {
      return res.fail('Kontaktna oseba ne obstaja', 404);
    }

    const count = await ProjectModel.countDocuments();
    const projectId = 1300 + count + 1;

    const project = await ProjectModel.create({
      project_id: projectId,
      name,
      description,
      city,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      company_id: company._id,
      contact_id: contact._id,
      notes: Array.isArray(notes) ? notes : [],
      documents: ensureDocuments(),
      timeline: buildDefaultTimeline()
    });

    await CrmPersonModel.findByIdAndUpdate(contact._id, {
      $addToSet: { project_ids: project._id }
    });

    res.success(mapProjectResponse(project.toObject()));
  } catch (error) {
    res.fail('Neuspešno ustvarjanje projekta');
  }
}

export async function updateProject(req: Request, res: Response) {
  try {
    const payload = normalizeUnicode(req.body);
    const updates: Record<string, any> = {};

    if (payload.name) updates.name = payload.name;
    if (payload.description) updates.description = payload.description;
    if (payload.city) updates.city = payload.city;
    if (payload.startDate) updates.startDate = new Date(payload.startDate);
    if (payload.endDate) updates.endDate = new Date(payload.endDate);
    if (payload.notes) updates.notes = Array.isArray(payload.notes) ? payload.notes : [payload.notes];

    if (payload.company_id) {
      const company = await CrmCompanyModel.findById(payload.company_id);
      if (!company) return res.fail('Nova stranka ne obstaja', 404);
      updates.company_id = company._id;
    }

    if (payload.contact_id) {
      const contact = await CrmPersonModel.findById(payload.contact_id);
      if (!contact) return res.fail('Nov kontakt ne obstaja', 404);
      updates.contact_id = contact._id;
    }

    if (payload.status && typeof payload.status === 'string') {
      if (!STATUS_ORDER.includes(payload.status as ProjectStatus)) {
        return res.fail('Neveljaven status projekta');
      }
      updates.status = payload.status;
    }

    const project = await findProjectByParam(req.params.id);
    if (!project) {
      return res.fail('Projekt ni najden', 404);
    }

    Object.assign(project, updates);
    await project.save();

    await project.populate('company_id', 'name');
    await project.populate('contact_id', 'first_name last_name');

    res.success(mapProjectResponse(project.toObject()));
  } catch (error) {
    res.fail('Neuspešna posodobitev projekta');
  }
}

export async function deleteProject(req: Request, res: Response) {
  try {
    const project = await findProjectByParam(req.params.id);
    if (!project) {
      return res.fail('Projekt ni najden', 404);
    }
    if (project.status !== 'draft') {
      return res.fail('Projekt je že potrjen, brisanje ni dovoljeno', 403);
    }

    await CrmPersonModel.findByIdAndUpdate(project.contact_id, {
      $pull: { project_ids: project._id }
    });

    await project.deleteOne();
    res.success({ message: 'Projekt izbrisan' });
  } catch (error) {
    res.fail('Napaka pri brisanju projekta');
  }
}

export async function confirmProjectPhase(req: Request, res: Response) {
  try {
    const normalized = normalizeUnicode(req.body);
    const phase = normalized.phase as ProjectPhase | undefined;
    if (!phase || !TIMELINE_PHASES.includes(phase)) {
      return res.fail('Faza ni določena');
    }

    const project = await findProjectByParam(req.params.id);
    if (!project) return res.fail('Projekt ni najden', 404);

    const documentKey = phaseToDocumentKey[phase];
    const documentId = project.documents[documentKey] ?? new Types.ObjectId();
    project.documents = ensureDocuments(project.documents);
    project.documents[documentKey] = documentId;

    project.timeline = completeTimelinePhase(project.timeline.length ? project.timeline : buildDefaultTimeline(), phase, documentId);

    const targetStatus = phaseStatusMap[phase];
    if (STATUS_ORDER.indexOf(targetStatus) >= STATUS_ORDER.indexOf(project.status)) {
      project.status = targetStatus;
    }

    if (phase === 'invoice') {
      project.endDate = project.endDate ?? new Date();
    }

    await project.save();
    await project.populate('company_id', 'name');
    await project.populate('contact_id', 'first_name last_name');

    res.success(mapProjectResponse(project.toObject()));
  } catch (error) {
    res.fail('Neuspel prehod faze');
  }
}

export async function getProjectTimeline(req: Request, res: Response) {
  try {
    const project = await findProjectByParam(req.params.id);
    if (!project) {
      return res.fail('Projekt ni najden', 404);
    }
    res.success({ timeline: project.timeline ?? [] });
  } catch (error) {
    res.fail('Ne morem pridobiti časovnice');
  }
}
