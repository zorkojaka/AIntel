import crypto from 'crypto';
import { sendEmail } from '../communication/services/email-transport.service';
import { getCommunicationSenderSettings } from '../communication/services/communication.service';
import { resolveProjectClient } from '../projects/services/project.service';
import type { ProjectDocument } from '../projects/schemas/project';
import { getWebInquirySettings } from '../web-inquiries/web-inquiry-settings.model';
import { ReviewModel } from './review.model';

function javnoIme(fullName: string) {
  const deli = (fullName || '').trim().split(/\s+/);
  if (deli.length < 2) return deli[0] || 'Stranka';
  return `${deli[0]} ${deli[1].charAt(0).toUpperCase()}.`;
}

/**
 * Ob zaključku projekta pošlje stranki prošnjo za oceno z unikatnim linkom.
 * Kliče se fire-and-forget iz project.controller (status -> completed).
 */
export async function requestReviewForProject(project: ProjectDocument | any) {
  try {
    const projectId = project.id as string;
    const existing = await ReviewModel.findOne({ projectId });
    if (existing) return;

    const client = await resolveProjectClient(project);
    const email = client?.email?.trim();
    if (!email) {
      console.warn(`[reviews] Projekt ${projectId}: stranka nima e-naslova, prošnja za oceno ni poslana.`);
      return;
    }

    const settings = await getWebInquirySettings();
    const sender = await getCommunicationSenderSettings();
    if (!sender.enabled || !sender.senderEmail) return;

    const token = crypto.randomBytes(20).toString('hex');
    const review = await ReviewModel.create({
      projectId,
      clientId: (client as any)?.id ?? null,
      name: javnoIme(client?.name ?? project.customer?.name ?? ''),
      pillar: (project.categories ?? [])[0] ?? '',
      token,
      status: 'poslano',
    });

    const url = `${(settings as any).reviewPageUrl || 'https://inteligent.si/ocena'}?token=${token}`;
    const besedilo = [
      `Pozdravljeni,`,
      '',
      `hvala, da ste nam zaupali izvedbo projekta. Veseli bomo, če si vzamete minuto in ocenite naše delo:`,
      '',
      url,
      '',
      `Vaša ocena nam pomaga izboljševati storitev in pomaga drugim strankam pri odločitvi.`,
      '',
      `Lep pozdrav,`,
      `${sender.senderName || 'Inteligent d.o.o.'}`,
    ].join('\n');

    await sendEmail({
      from: `"${sender.senderName || 'Inteligent'}" <${sender.senderEmail}>`,
      to: email,
      subject: 'Kako ste zadovoljni z izvedbo? Ocenite nas',
      text: besedilo,
    });
    review.emailSentAt = new Date();
    await review.save();
    console.log(`[reviews] Prošnja za oceno poslana (projekt ${projectId}, ${email}).`);
  } catch (error) {
    console.error('[reviews] Pošiljanje prošnje za oceno ni uspelo:', error instanceof Error ? error.message : error);
  }
}

export async function getReviewByToken(token: string) {
  if (!/^[a-f0-9]{40}$/.test(token)) return null;
  return ReviewModel.findOne({ token });
}

export async function submitReview(token: string, rating: number, comment: string) {
  const review = await getReviewByToken(token);
  if (!review) return { ok: false as const, code: 'NOT_FOUND' };
  if (review.submittedAt) return { ok: false as const, code: 'ALREADY_SUBMITTED' };
  const ocena = Math.round(Number(rating));
  if (!Number.isInteger(ocena) || ocena < 1 || ocena > 5) return { ok: false as const, code: 'VALIDATION_ERROR' };

  review.rating = ocena;
  review.comment = (comment || '').trim().slice(0, 1000);
  review.submittedAt = new Date();
  // 4-5 zvezdic gre samodejno v javnost, 1-3 caka na Jaka (in ne bo javna brez odobritve).
  review.status = ocena >= 4 ? 'odobreno' : 'oddano';
  await review.save();

  const settings = await getWebInquirySettings();
  return {
    ok: true as const,
    rating: ocena,
    googleReviewUrl: ocena >= 4 ? ((settings as any).googleReviewUrl || '') : '',
  };
}

export async function listApprovedReviews(limit = 12) {
  const reviews = await ReviewModel.find({ status: 'odobreno', rating: { $gte: 1 } })
    .sort({ submittedAt: -1 })
    .limit(Math.min(limit, 50))
    .lean();
  const agregat = await ReviewModel.aggregate([
    { $match: { status: 'odobreno', rating: { $gte: 1 } } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return {
    average: agregat[0] ? Number(agregat[0].avg.toFixed(1)) : null,
    count: agregat[0]?.count ?? 0,
    reviews: reviews.map((review) => ({
      name: review.name,
      rating: review.rating,
      comment: review.comment ?? '',
      pillar: review.pillar,
      date: review.submittedAt ? review.submittedAt.toISOString().slice(0, 7) : '',
    })),
  };
}
