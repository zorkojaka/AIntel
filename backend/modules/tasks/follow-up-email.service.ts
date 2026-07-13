import mongoose from 'mongoose';

import type { CommunicationAttachmentType } from '../../../shared/types/communication';
import { getSettings } from '../settings/settings.service';
import { CommunicationTemplateModel } from '../communication/schemas/template';
import {
  buildActorDisplayName,
  sendOfferCommunicationEmail,
} from '../communication/services/communication.service';
import { buildTemplateContext, renderCommunicationTemplate } from '../communication/services/template-render.service';
import { OfferVersionModel } from '../projects/schemas/offer-version';
import { ProjectModel } from '../projects/schemas/project';
import { resolveProjectClient } from '../projects/services/project.service';
import { TaskModel } from './task.model';
import { TaskError, updateTask, type ActorContext } from './task.service';

const FOLLOW_UP_TEMPLATE_KEY = 'offer_follow_up';
const FOLLOW_UP_OUTCOME = 'follow-up mail poslan';
const FOLLOW_UP_ATTACHMENTS: CommunicationAttachmentType[] = ['offer_pdf'];
const PREVIEW_SENDER_SETTINGS = {
  senderName: '',
  senderEmail: '',
  senderPhone: '',
  senderRole: '',
  enabled: false,
};

export type OfferFollowUpEmailDraft = {
  taskId: string;
  projectId: string;
  offerId: string;
  to: string[];
  subject: string;
  body: string;
  selectedAttachments: CommunicationAttachmentType[];
  templateKey: string | null;
  taskTitle: string;
  offerLabel: string;
};

function cleanString(value: unknown, maxLength = 2000): string {
  return typeof value === 'string' ? value.normalize('NFC').trim().slice(0, maxLength) : '';
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function assertTaskId(value: string) {
  if (!mongoose.isValidObjectId(value)) {
    throw new TaskError('Neveljaven ID opravila.');
  }
  return new mongoose.Types.ObjectId(value);
}

async function loadFollowUpContext(context: ActorContext, taskId: string) {
  const id = assertTaskId(taskId);
  const task = await TaskModel.findOne({ _id: id, tenantId: context.tenantId });
  if (!task) throw new TaskError('Opravilo ne obstaja.', 404);
  if (task.type !== 'offer.follow_up' || task.subject?.kind !== 'offerVersion' || !task.subject.id) {
    throw new TaskError('Opravilo ni follow-up za ponudbo.', 400);
  }
  if (!['open', 'in_progress'].includes(task.status)) {
    throw new TaskError('Follow-up e-mail je mogoče pripraviti samo za odprto opravilo.', 409);
  }

  const offer = await OfferVersionModel.findById(task.subject.id);
  if (!offer) throw new TaskError('Ponudba za follow-up ni najdena.', 404);
  const project = await ProjectModel.findOne({ id: offer.projectId });
  if (!project) throw new TaskError('Projekt za follow-up ni najden.', 404);
  const client = await resolveProjectClient(project);
  const recipient = client?.email?.trim().toLowerCase();
  if (!recipient) {
    throw new TaskError('Stranka nima e-naslova za follow-up.', 400);
  }

  return { task, offer, project, client, recipient };
}

async function buildOfferFollowUpDraft(context: ActorContext, taskId: string): Promise<OfferFollowUpEmailDraft> {
  const { task, offer, project, client, recipient } = await loadFollowUpContext(context, taskId);
  const [template, globalSettings] = await Promise.all([
    CommunicationTemplateModel.findOne({
      key: FOLLOW_UP_TEMPLATE_KEY,
      category: 'offer_send',
      isActive: true,
    }).lean(),
    getSettings(),
  ]);

  const offerNumber = offer.documentNumber ?? offer.title ?? String(offer._id);
  const offerTotal = `${formatCurrency(Number(offer.totalWithVat ?? offer.totalGrossAfterDiscount ?? offer.totalGross ?? 0))} EUR`;
  const templateContext = buildTemplateContext({
    customerName: project.customer?.name ?? client?.name ?? '',
    customerEmail: client?.email ?? '',
    projectName: project.title ?? '',
    offerNumber,
    offerTotal,
    companyName: globalSettings.companyName ?? '',
    companyWebsite: globalSettings.website ?? '',
    companyAddress: globalSettings.address ?? '',
    companyEmail: globalSettings.email ?? '',
    companyPhone: globalSettings.phone ?? '',
    companyLogoUrl: '',
    sender: PREVIEW_SENDER_SETTINGS,
  });

  const rendered = template
    ? renderCommunicationTemplate(template, templateContext)
    : {
        subject: `Follow-up za ponudbo ${offerNumber}`,
        body: [
          `Spoštovani ${project.customer?.name ?? client?.name ?? ''},`,
          '',
          `preverjam, ali ste imeli priložnost pregledati ponudbo ${offerNumber} v vrednosti ${offerTotal}.`,
          'Ponudbo ponovno prilagam v PDF obliki.',
          '',
          'Če imate kakšno vprašanje ali želite prilagoditev ponudbe, sem vam na voljo.',
          '',
          'Lep pozdrav',
        ].join('\n'),
      };

  return {
    taskId: String(task._id),
    projectId: offer.projectId,
    offerId: String(offer._id),
    to: [recipient],
    subject: rendered.subject,
    body: rendered.body,
    selectedAttachments: FOLLOW_UP_ATTACHMENTS,
    templateKey: template ? FOLLOW_UP_TEMPLATE_KEY : null,
    taskTitle: task.title,
    offerLabel: task.subject.label || offerNumber,
  };
}

export async function previewOfferFollowUpEmail(context: ActorContext, taskId: string) {
  return buildOfferFollowUpDraft(context, taskId);
}

export async function sendOfferFollowUpEmail(
  context: ActorContext,
  taskId: string,
  payload: { to?: unknown; subject?: unknown; body?: unknown },
  reqLike: Parameters<typeof buildActorDisplayName>[0],
) {
  const draft = await buildOfferFollowUpDraft(context, taskId);
  const to = Array.isArray(payload.to) ? payload.to.map((entry) => cleanString(entry, 320)).filter(Boolean) : draft.to;
  const subject = cleanString(payload.subject, 300) || draft.subject;
  const body = cleanString(payload.body, 10000) || draft.body;
  if (to.length === 0) throw new TaskError('Prejemnik emaila ni določen.');
  if (!subject || !body) throw new TaskError('Zadeva in vsebina emaila sta obvezni.');

  const result = await sendOfferCommunicationEmail({
    projectId: draft.projectId,
    offerId: draft.offerId,
    to,
    subject,
    body,
    selectedAttachments: draft.selectedAttachments,
    templateKey: draft.templateKey,
    actorUserId: context.actorUserId,
    actorDisplayName: buildActorDisplayName(reqLike),
  });

  const task = await updateTask(context, taskId, {
    action: 'complete',
    resolution: {
      outcome: FOLLOW_UP_OUTCOME,
      note: `Email ${result.message.id} poslan na ${to.join(', ')}`,
    },
  });

  return { ...result, task };
}
