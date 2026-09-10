import type { CommunicationCategory } from '../../../../shared/types/communication';
import { CommunicationTemplateModel } from '../schemas/template';
import { buildTemplateContext, renderCommunicationTemplate } from './template-render.service';

// Initial values are persisted once. Subsequent edits in communication settings win.
const DEFAULTS = [
  {
    key: 'invoice-review-request', category: 'invoice_review_request',
    name: 'Prošnja za oceno ob računu', subjectTemplate: 'Prošnja za oceno',
    bodyTemplate: 'Zelo bomo veseli, če si vzamete minuto in ocenite našo izvedbo:\n{{review.link}}\nVaše mnenje nam veliko pomeni in pomaga drugim strankam pri odločitvi.',
  },
  {
    key: 'offer-booking-invite', category: 'offer_booking_invite',
    name: 'Izbira termina ob ponudbi', subjectTemplate: 'Izbira termina',
    bodyTemplate: 'Termin montaže lahko izberete na naslednji povezavi. Prikazani so združeni prosti termini izbranih monterjev:\n{{booking.link}}',
  },
  {
    key: 'booking-selected-internal', category: 'booking_selected_internal',
    name: 'Izbran termin — prodajalec in administrator',
    subjectTemplate: 'Stranka je izbrala termin — {{project.name}}',
    bodyTemplate: 'Stranka {{customer.name}} je izbrala termin montaže.\n\nProjekt: {{project.name}}\nTermin: {{workOrder.schedule}}',
  },
] as const;

export async function ensureBookingReviewTemplates(category?: CommunicationCategory) {
  for (const template of DEFAULTS) {
    if (category && template.category !== category) continue;
    if (await CommunicationTemplateModel.exists({ category: template.category })) continue;
    try {
      await CommunicationTemplateModel.updateOne(
        { key: template.key },
        { $setOnInsert: { ...template, defaultAttachments: [], isActive: true } },
        { upsert: true },
      );
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
  }
}

export async function renderBookingReviewTemplate(
  category: typeof DEFAULTS[number]['category'],
  context: ReturnType<typeof buildTemplateContext>,
  requiredLink?: string,
) {
  await ensureBookingReviewTemplates(category);
  const template = await CommunicationTemplateModel.findOne({ category, isActive: true }).sort({ updatedAt: -1 }).lean();
  if (!template) throw new Error('V nastavitvah komunikacije manjka aktivna predloga: ' + category);
  const rendered = renderCommunicationTemplate(template, context);
  if (!rendered.body) throw new Error('Vsebina komunikacijske predloge je prazna.');
  if (requiredLink && !rendered.body.includes(requiredLink)) rendered.body += '\n' + requiredLink;
  return { ...rendered, template };
}
