import { Request, Response } from 'express';
import {
  ProjectDetail,
  ProjectOffer,
  ProjectSummary,
  addTimelineEntry,
  nextProjectId,
  projectsStore,
  summarizeProject,
} from '../schemas/project';

interface CreateProjectPayload {
  title: string;
  customer: {
    name: string;
    taxId?: string;
    address?: string;
    paymentTerms?: string;
  };
  city?: string;
  requirements?: string;
}

interface ConfirmPhasePayload {
  phase: 'offer' | 'delivery' | 'completion';
  action?: 'confirm' | 'cancel';
  offerId?: string;
  user?: string;
  note?: string;
}

function findProject(projectId: string) {
  return projectsStore.find((project) => project.id === projectId);
}

function recalculateTotals(project: ProjectDetail) {
  if (project.items.length === 0) {
    project.offerAmount = 0;
    return;
  }

  const net = project.items.reduce((sum, item) => sum + item.quantity * item.price * (1 - item.discount / 100), 0);
  project.offerAmount = Math.round(net * 1.22);
}

function setOfferState(offers: ProjectOffer[], offerId: string, isSelected: boolean, status: ProjectOffer['status']) {
  return offers.map((offer) => ({
    ...offer,
    isSelected: offer.id === offerId ? isSelected : false,
    status: offer.id === offerId ? status : offer.status,
  }));
}

function confirmOfferPhase(project: ProjectDetail, payload: ConfirmPhasePayload) {
  if (!payload.offerId) {
    throw new Error('Manjka ID ponudbe za potrditev.');
  }

  const offer = project.offers.find((o) => o.id === payload.offerId);
  if (!offer) {
    throw new Error(`Ponudba ${payload.offerId} ne obstaja.`);
  }

  if (payload.action === 'cancel') {
    project.offers = project.offers.map((o) => ({ ...o, isSelected: false, status: o.status }));
    project.status = 'offered';
    addTimelineEntry(project, {
      type: 'status-change',
      title: `Potrditev ponudbe ${offer.version} preklicana`,
      description: payload.note ?? 'Projekt vrnjen v fazo Ponujeno.',
      user: payload.user ?? 'Sistem',
    });
    return;
  }

  project.offers = setOfferState(project.offers, payload.offerId, true, 'accepted');
  project.status = 'ordered';

  addTimelineEntry(project, {
    type: 'offer',
    title: `Ponudba v${offer.version} potrjena`,
    description: payload.note ?? 'Ponudba označena kot izbrana.',
    user: payload.user ?? 'Sistem',
    metadata: { amount: `€ ${offer.amount.toFixed(2)}` },
  });

  addTimelineEntry(project, {
    type: 'status-change',
    title: 'Status spremenjen',
    description: "Projekt prešel v fazo 'Naročeno'",
    user: payload.user ?? 'Sistem',
  });
}

function confirmDeliveryPhase(project: ProjectDetail, payload: ConfirmPhasePayload) {
  project.status = 'in-progress';
  addTimelineEntry(project, {
    type: 'delivery',
    title: 'Dobavnica potrjena',
    description: payload.note ?? 'Dobava potrjena in material prevzet.',
    user: payload.user ?? 'Sistem',
  });

  addTimelineEntry(project, {
    type: 'status-change',
    title: 'Status spremenjen',
    description: "Projekt prešel v fazo 'V teku'",
    user: payload.user ?? 'Sistem',
  });
}

function confirmCompletionPhase(project: ProjectDetail, payload: ConfirmPhasePayload) {
  project.status = 'completed';
  addTimelineEntry(project, {
    type: 'execution',
    title: 'Zaključek del potrjen',
    description: payload.note ?? 'Projekt označen kot zaključen.',
    user: payload.user ?? 'Sistem',
  });

  addTimelineEntry(project, {
    type: 'status-change',
    title: 'Status spremenjen',
    description: "Projekt prešel v fazo 'Zaključeno'",
    user: payload.user ?? 'Sistem',
  });
}

function toDetail(project: ProjectDetail) {
  recalculateTotals(project);
  return project;
}

export function listProjects(_req: Request, res: Response) {
  const summaries: ProjectSummary[] = projectsStore.map((project) => summarizeProject(project));
  return res.success(summaries);
}

export function createProject(req: Request, res: Response) {
  const payload = req.body as CreateProjectPayload;

  if (!payload?.title || !payload?.customer?.name) {
    return res.fail('Za nov projekt sta potrebna naziv in stranka.', 400);
  }

  const id = nextProjectId();
  const project: ProjectDetail = {
    id,
    title: payload.title,
    customer: payload.customer.name,
    status: 'draft',
    offerAmount: 0,
    invoiceAmount: 0,
    createdAt: new Date().toISOString().slice(0, 10),
    city: payload.city ?? 'Ljubljana',
    requirements:
      payload.requirements ?? 'Opis projekta še ni nastavljen. Dodaj zahteve v delovnem prostoru.',
    customerInfo: {
      name: payload.customer.name,
      taxId: payload.customer.taxId ?? 'SI00000000',
      address: payload.customer.address ?? 'Ni nastavljen',
      paymentTerms: payload.customer.paymentTerms ?? '30 dni',
    },
    items: [],
    offers: [
      {
        id: `${id}-offer-1`,
        version: 1,
        status: 'draft',
        amount: 0,
        date: new Date().toISOString().slice(0, 10),
      },
    ],
    workOrders: [],
    timeline: [],
  };

  addTimelineEntry(project, {
    type: 'edit',
    title: 'Projekt ustvarjen',
    description: payload.requirements ?? 'Ustvarjen nov projekt skozi UI.',
    user: 'Projekti modul',
  });

  projectsStore.unshift(project);

  return res.success(toDetail(project), 201);
}

export function getProject(req: Request, res: Response) {
  const projectId = req.params.id;
  const project = findProject(projectId);

  if (!project) {
    return res.fail(`Projekt ${projectId} ne obstaja.`, 404);
  }

  return res.success(toDetail(project));
}

export function confirmPhase(req: Request, res: Response) {
  const projectId = req.params.id;
  const payload = req.body as ConfirmPhasePayload;
  const project = findProject(projectId);

  if (!project) {
    return res.fail(`Projekt ${projectId} ne obstaja.`, 404);
  }

  if (!payload?.phase) {
    return res.fail('Manjka parameter phase.', 400);
  }

  try {
    if (payload.phase === 'offer') {
      confirmOfferPhase(project, payload);
    } else if (payload.phase === 'delivery') {
      confirmDeliveryPhase(project, payload);
    } else if (payload.phase === 'completion') {
      confirmCompletionPhase(project, payload);
    } else {
      return res.fail(`Faza ${payload.phase} ni podprta.`, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Neznana napaka pri potrjevanju faze.';
    return res.fail(message, 400);
  }

  return res.success(toDetail(project));
}

export function getTimeline(req: Request, res: Response) {
  const projectId = req.params.id;
  const project = findProject(projectId);

  if (!project) {
    return res.fail(`Projekt ${projectId} ne obstaja.`, 404);
  }

  return res.success(project.timeline);
}
