import { MaterialOrderModel } from '../projects/schemas/material-order';
import { ProjectModel, newTimelineEventId } from '../projects/schemas/project';
import { getCommunicationSenderSettings } from '../communication/services/communication.service';
import { sendEmail } from '../communication/services/email-transport.service';
import {
  appendCommunicationFooter,
  buildTemplateContext,
  renderCommunicationBodyHtml,
  renderCommunicationFooterHtmlForEmail,
  renderCommunicationText,
} from '../communication/services/template-render.service';
import { getSettings } from '../settings/settings.service';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type MaterialOrderItem = {
  id: string;
  quantity: number;
  isOrdered?: boolean;
  orderedQty?: number;
  materialStep?: string;
  isExtra?: boolean;
};

/**
 * Po poslanem naročilu označi izbrane postavke kot naročene (orderedQty =
 * plan); korakov, ki so že dlje (Za prevzem/Prevzeto/Pripravljeno), ne vrača.
 */
export function applySupplierOrderToItems<T extends MaterialOrderItem>(items: T[], itemIds: string[]): T[] {
  const ids = new Set(itemIds);
  return items.map((item) => {
    if (!ids.has(item.id)) return item;
    const planQty = typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
    const step = item.materialStep;
    const keepStep = step === 'Za prevzem' || step === 'Prevzeto' || step === 'Pripravljeno';
    return {
      ...item,
      orderedQty: planQty,
      isOrdered: planQty > 0,
      materialStep: keepStep ? step : 'Naročeno',
    };
  });
}

export async function sendSupplierOrderEmail(input: {
  projectId: string;
  materialOrderId: string;
  supplierName: string;
  itemIds: unknown;
  to: unknown;
  subject: unknown;
  body: unknown;
}) {
  const to = String(input.to ?? '').trim().toLowerCase();
  const subject = String(input.subject ?? '').trim();
  const body = String(input.body ?? '').trim();
  const supplierName = String(input.supplierName ?? '').trim() || 'dobavitelj';
  const itemIds = (Array.isArray(input.itemIds) ? input.itemIds : []).map((id) => String(id)).filter(Boolean);

  if (!EMAIL_REGEX.test(to)) throw new Error('Vnesite veljaven e-naslov dobavitelja.');
  if (!subject) throw new Error('Zadeva ne sme biti prazna.');
  if (!body) throw new Error('Vsebina ne sme biti prazna.');
  if (itemIds.length === 0) throw new Error('Naročilo nima izbranih postavk.');

  const senderSettings = await getCommunicationSenderSettings();
  if (!senderSettings.enabled || !senderSettings.senderEmail) {
    throw new Error('Pošiljanje ni omogočeno. Najprej nastavi pošiljatelja v nastavitvah komunikacije.');
  }

  const [order, project, globalSettings] = await Promise.all([
    MaterialOrderModel.findOne({ _id: input.materialOrderId, projectId: input.projectId, cancelledAt: null }),
    ProjectModel.findOne({ id: input.projectId }).select({ _id: 1, id: 1, title: 1 }),
    getSettings(),
  ]);
  if (!order) throw new Error('Naročilo materiala ni najdeno.');
  if (!project) throw new Error('Projekt ni najden.');

  const knownIds = new Set((order.items ?? []).map((item) => item.id));
  if (!itemIds.every((id) => knownIds.has(id))) {
    throw new Error('Nekatere postavke ne pripadajo temu naročilu.');
  }

  const templateContext = buildTemplateContext({
    customerName: '',
    projectName: project.title ?? '',
    offerNumber: '',
    offerTotal: '',
    companyName: globalSettings.companyName ?? '',
    companyWebsite: (globalSettings as any).website ?? '',
    companyAddress: (globalSettings as any).address ?? '',
    companyEmail: (globalSettings as any).email ?? '',
    companyPhone: (globalSettings as any).phone ?? '',
    sender: senderSettings,
  });
  const renderedFooter = renderCommunicationText(senderSettings.emailFooterTemplate, templateContext);
  const renderedFooterHtml = renderCommunicationFooterHtmlForEmail(senderSettings.emailFooterTemplate, templateContext);
  const bodyFinal = appendCommunicationFooter(body, renderedFooter);
  const htmlFinal = renderCommunicationBodyHtml(body, renderedFooterHtml);

  await sendEmail({
    from: `"${senderSettings.senderName || 'Inteligent'}" <${senderSettings.senderEmail}>`,
    to,
    bcc: senderSettings.defaultBcc || undefined,
    replyTo: senderSettings.replyToEmail || undefined,
    subject,
    text: bodyFinal,
    html: htmlFinal,
  });

  order.items = applySupplierOrderToItems(order.items as any, itemIds) as any;
  const plannedItems = (order.items ?? []).filter((item: any) => !item.isExtra);
  if (order.status === 'draft' && plannedItems.length > 0 && plannedItems.every((item: any) => item.isOrdered)) {
    order.status = 'ordered';
  }
  await order.save();

  await ProjectModel.updateOne(
    { id: input.projectId },
    {
      $push: {
        timeline: {
          id: newTimelineEventId(),
          type: 'edit',
          title: `Naročilo poslano dobavitelju ${supplierName}`,
          description: `${to}: ${subject} (${itemIds.length} postavk)`,
          timestamp: new Date().toLocaleString('sl-SI'),
          user: 'Priprava',
          metadata: { materialOrderId: String(order._id) },
        },
      },
    },
  );

  return { sent: true as const, orderedItemIds: itemIds };
}
