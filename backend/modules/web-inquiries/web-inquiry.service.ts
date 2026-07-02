import { Types } from 'mongoose';
import { CrmClientModel } from '../crm/schemas/client';
import { ProductModel } from '../cenik/product.model';
import {
  Project,
  ProjectModel,
  addTimeline,
  generateProjectIdentifiers,
} from '../projects/schemas/project';
import { calculateProjectRouteDistance } from '../projects/services/route-distance.service';
import { sendOfferCommunicationEmail } from '../communication/services/communication.service';
import { CommunicationTemplateModel } from '../communication/schemas/template';
import { ZahtevaModel } from '../zahteve/zahteva.model';
import {
  izracunajInPredlagajDisk,
  nadaljujNaPonudbo,
  predlagajNosilce,
  predlagajPoESwitch,
  predlagajSnemalnik,
} from '../zahteve/zahteva.service';
import { getWebInquirySettings, type WebInquirySettingsDocument } from './web-inquiry-settings.model';
import { WebInquiryModel, type WebInquiryDocument, type WebInquiryPillar } from './web-inquiry.model';

export class WebInquiryError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface WebInquiryContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  siteAddress: { street: string; postalCode: string; city: string; full: string };
}

export interface WebInquiryPayload {
  pillar: WebInquiryPillar;
  contact: WebInquiryContact;
  videonadzor?: {
    cameraCount: number;
    wiringType: 'wifi' | 'wired';
    wiringReady: boolean;
  };
  note?: string;
  source?: string;
}

const PILLARS: WebInquiryPillar[] = ['videonadzor', 'alarm', 'domofon', 'pametni_dom'];
const PILLAR_LABELS: Record<WebInquiryPillar, string> = {
  videonadzor: 'Videonadzor',
  alarm: 'Alarm',
  domofon: 'Domofon',
  pametni_dom: 'Pametni dom',
};

function cleanString(value: unknown, maxLength = 200): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').trim().slice(0, maxLength);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function parseSiteAddress(input: unknown): WebInquiryContact['siteAddress'] {
  if (typeof input === 'string') {
    const full = cleanString(input, 300);
    const match = full.match(/^(.*?),?\s*(\d{4})\s+(.+)$/);
    return {
      street: match ? cleanString(match[1]) : full,
      postalCode: match ? match[2] : '',
      city: match ? cleanString(match[3]) : '',
      full,
    };
  }
  const source = (input ?? {}) as Record<string, unknown>;
  const street = cleanString(source.street);
  const postalCode = cleanString(source.postalCode, 10);
  const city = cleanString(source.city, 80);
  const full = [street, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { street, postalCode, city, full };
}

export function validateWebInquiryPayload(body: unknown): WebInquiryPayload {
  const source = (body ?? {}) as Record<string, any>;
  const pillar = cleanString(source.pillar, 30) as WebInquiryPillar;
  if (!PILLARS.includes(pillar)) {
    throw new WebInquiryError('VALIDATION_ERROR', `Neveljaven steber (pillar). Dovoljeno: ${PILLARS.join(', ')}.`, 400);
  }

  const contactSource = (source.contact ?? {}) as Record<string, unknown>;
  const contact: WebInquiryContact = {
    firstName: cleanString(contactSource.firstName, 80),
    lastName: cleanString(contactSource.lastName, 80),
    email: cleanString(contactSource.email, 160).toLowerCase(),
    phone: cleanString(contactSource.phone, 40),
    siteAddress: parseSiteAddress(contactSource.siteAddress),
  };

  if (!contact.firstName || !contact.lastName) {
    throw new WebInquiryError('VALIDATION_ERROR', 'Manjkata ime in priimek (contact.firstName, contact.lastName).', 400);
  }
  if (!isValidEmail(contact.email)) {
    throw new WebInquiryError('VALIDATION_ERROR', 'Neveljaven e-naslov (contact.email).', 400);
  }
  if (!contact.phone) {
    throw new WebInquiryError('VALIDATION_ERROR', 'Manjka telefonska številka (contact.phone).', 400);
  }
  if (!contact.siteAddress.full) {
    throw new WebInquiryError('VALIDATION_ERROR', 'Manjka naslov objekta (contact.siteAddress).', 400);
  }

  const payload: WebInquiryPayload = {
    pillar,
    contact,
    note: cleanString(source.note, 1000),
    source: cleanString(source.source, 120) || 'web',
  };

  if (pillar === 'videonadzor') {
    const video = (source.videonadzor ?? {}) as Record<string, unknown>;
    const cameraCount = Number(video.cameraCount);
    if (!Number.isInteger(cameraCount) || cameraCount < 1 || cameraCount > 64) {
      throw new WebInquiryError('VALIDATION_ERROR', 'Število kamer (videonadzor.cameraCount) mora biti celo število med 1 in 64.', 400);
    }
    const wiringType = cleanString(video.wiringType, 10);
    if (wiringType !== 'wifi' && wiringType !== 'wired') {
      throw new WebInquiryError('VALIDATION_ERROR', 'Tip ožičenja (videonadzor.wiringType) mora biti "wifi" ali "wired".', 400);
    }
    payload.videonadzor = {
      cameraCount,
      wiringType,
      wiringReady: video.wiringReady === true || video.wiringReady === 'true',
    };
  }

  return payload;
}

async function findOrCreateClient(contact: WebInquiryContact, note: string | undefined, defaultsApplied: string[]) {
  const existingByEmail = await CrmClientModel.findOne({ email: contact.email, isActive: true });
  if (existingByEmail) {
    const update: Record<string, unknown> = {};
    if (!existingByEmail.phone) update.phone = contact.phone;
    if (!existingByEmail.street && contact.siteAddress.street) {
      update.street = contact.siteAddress.street;
      update.postalCode = contact.siteAddress.postalCode;
      update.postalCity = contact.siteAddress.city;
      update.address = contact.siteAddress.full;
    }
    if (Object.keys(update).length > 0) {
      await CrmClientModel.updateOne({ _id: existingByEmail._id }, { $set: update });
    }
    defaultsApplied.push('Stranka je bila najdena po e-naslovu v CRM (nov zapis ni bil ustvarjen).');
    return existingByEmail;
  }

  // Project → client resolution matches by name, so make the name unique when a
  // different client already uses it (otherwise the offer would resolve to the wrong client).
  const baseName = `${contact.firstName} ${contact.lastName}`.trim();
  let name = baseName;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const clash = await CrmClientModel.findOne({ name });
    if (!clash) break;
    name = `${baseName} (${suffix})`;
  }

  return CrmClientModel.create({
    name,
    type: 'individual',
    email: contact.email,
    phone: contact.phone,
    street: contact.siteAddress.street,
    postalCode: contact.siteAddress.postalCode,
    postalCity: contact.siteAddress.city,
    address: contact.siteAddress.full,
    tags: ['spletno-povprasevanje'],
    notes: note || undefined,
    isActive: true,
  });
}

async function createProjectForInquiry(input: {
  clientName: string;
  siteAddressFull: string;
  pillar: WebInquiryPillar;
  category: string;
  note?: string;
}) {
  const { id, code, projectNumber } = await generateProjectIdentifiers();
  const project: Project = {
    id,
    code,
    projectNumber,
    title: `${PILLAR_LABELS[input.pillar]} – ${input.clientName}`,
    customer: {
      name: input.clientName,
      address: input.siteAddressFull,
      paymentTerms: '30 dni',
    },
    status: 'draft',
    offerAmount: 0,
    quotedTotal: 0,
    quotedVat: 0,
    quotedTotalWithVat: 0,
    invoiceAmount: 0,
    createdAt: new Date().toISOString().slice(0, 10),
    requirementsText: input.note ?? '',
    requirements: [],
    items: [],
    offers: [],
    workOrders: [],
    purchaseOrders: [],
    deliveryNotes: [],
    timeline: [],
    templates: [],
    categories: [input.category],
  };

  addTimeline(project, {
    type: 'edit',
    title: 'Projekt ustvarjen',
    description: 'Spletno povpraševanje (inteligent.si)',
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Spletna stran',
  });

  await ProjectModel.create(project);
  return ProjectModel.findOne({ id });
}

async function buildVideonadzorZahteva(input: {
  projectMongoId: Types.ObjectId;
  projectId: string;
  cameraCount: number;
  wiringType: 'wifi' | 'wired';
  wiringReady: boolean;
  settings: WebInquirySettingsDocument;
  defaultsApplied: string[];
}) {
  const { settings, defaultsApplied } = input;
  const video = settings.videonadzor;
  const cameraProductId = input.wiringType === 'wifi' ? video.wifiCameraProductId : video.wiredCameraProductId;
  if (!cameraProductId) {
    throw new WebInquiryError(
      'NOT_CONFIGURED',
      `V nastavitvah spletnih povpraševanj ni izbrana ${input.wiringType === 'wifi' ? 'WiFi' : 'žična'} kamera.`,
      503
    );
  }

  const camera = await ProductModel.findById(cameraProductId).lean();
  if (!camera) {
    throw new WebInquiryError('NOT_CONFIGURED', 'Izbrana kamera v ceniku ne obstaja več.', 503);
  }
  defaultsApplied.push(`Kamera: ${camera.ime} (fiksna izbira iz nastavitev).`);

  let nosilecProductId: string | null = null;
  if (video.includeBrackets) {
    const nosilci = await predlagajNosilce(String(camera._id));
    if (nosilci.length > 0) {
      nosilecProductId = String(nosilci[0]._id);
      defaultsApplied.push(`Nosilec: ${nosilci[0].ime} (najcenejši združljiv).`);
    }
  }

  const isWifi = input.wiringType === 'wifi';
  const videonadzor: Record<string, unknown> = {
    asortima: [{ id: 'var-1', kameraProductId: String(camera._id), nosilecProductId }],
    lokacije: Array.from({ length: input.cameraCount }, (_, index) => ({
      id: `loc-${index + 1}`,
      ime: `Kamera ${index + 1}`,
      asortimaIdAssigned: 'var-1',
      slike: [],
    })),
    snemalnik: { productId: null },
    poeSwitch: { productId: null, kolicina: 0, items: [] },
    disk: { productId: null, kolicina: 0, items: [], dniSnemanja: video.dniSnemanja, motionRecord: video.motionRecord },
    dodatnaOprema: [],
  };

  if (!isWifi) {
    const manufacturer = camera.classification?.manufacturer ?? undefined;
    let snemalnik = await predlagajSnemalnik(input.cameraCount, manufacturer, true);
    let potrebujeSwitch = false;
    if (!snemalnik) {
      snemalnik = await predlagajSnemalnik(input.cameraCount, manufacturer, false);
      potrebujeSwitch = true;
    }
    if (!snemalnik) {
      throw new WebInquiryError('ENGINE_ERROR', 'V ceniku ni ustreznega snemalnika za to število kamer.', 502);
    }
    (videonadzor.snemalnik as any).productId = String(snemalnik._id);
    defaultsApplied.push(`Snemalnik: ${snemalnik.ime} (predlog sistema).`);

    if (potrebujeSwitch) {
      const poeSwitch = await predlagajPoESwitch(input.cameraCount);
      if (poeSwitch) {
        (videonadzor.poeSwitch as any) = {
          productId: String(poeSwitch._id),
          kolicina: 1,
          items: [{ productId: String(poeSwitch._id), kolicina: 1 }],
        };
        defaultsApplied.push(`PoE switch: ${poeSwitch.ime} (snemalnik nima PoE priklopov).`);
      }
    }

    const diskPredlog = await izracunajInPredlagajDisk({
      cameraIds: Array.from({ length: input.cameraCount }, () => String(camera._id)),
      savingDays: video.dniSnemanja,
      motionRecord: video.motionRecord,
    });
    if (diskPredlog.product) {
      (videonadzor.disk as any) = {
        productId: String(diskPredlog.product._id),
        kolicina: 1,
        items: [{ productId: String(diskPredlog.product._id), kolicina: 1 }],
        dniSnemanja: video.dniSnemanja,
        motionRecord: video.motionRecord,
      };
      defaultsApplied.push(
        `Disk: ${diskPredlog.product.ime} (${video.dniSnemanja} dni snemanja, ${video.motionRecord ? 'snemanje ob gibanju' : 'neprekinjeno snemanje'}).`
      );
    }
  }

  const scenarioType = isWifi
    ? video.scenarioWifi
    : input.wiringReady
      ? video.scenarioWiringReady
      : video.scenarioWiringNotReady;
  defaultsApplied.push(`Scenarij izvedbe: ${scenarioType}.`);

  const napeljava = !isWifi && !input.wiringReady;
  let kilometrinaKm = 0;
  try {
    const route = await calculateProjectRouteDistance(input.projectId);
    kilometrinaKm = route.razdaljaSkupaj;
    defaultsApplied.push(`Kilometrina: ${route.razdaljaSkupaj} km (samodejni izračun, zanesljivost ${route.zanesljivost}).`);
  } catch (error) {
    defaultsApplied.push(
      `Kilometrina ni bila izračunana samodejno (${error instanceof Error ? error.message : 'napaka'}) – preveri ročno.`
    );
  }

  const zahteva = await ZahtevaModel.create({
    projectId: input.projectMongoId,
    status: 'osnutek',
    sistemi: [
      {
        id: 'sys-1',
        tip: isWifi ? 'wifi_kamere' : 'videonadzor',
        steviloLokacij: input.cameraCount,
        videonadzor,
        execution: {
          scenarioType,
          estimates: {
            napeljavaUr: napeljava ? video.napeljavaUrPerCamera * input.cameraCount : 0,
            utpKabelMetrov: napeljava ? video.utpKabelMetrovPerCamera * input.cameraCount : 0,
            kanalMetrov: napeljava ? video.kanalMetrovPerCamera * input.cameraCount : 0,
            kilometrinaKm,
          },
        },
      },
    ],
    createdBy: null,
  });

  await ProjectModel.updateOne(
    { _id: input.projectMongoId },
    { $addToSet: { requestIds: zahteva._id }, $set: { activeRequestId: zahteva._id } }
  );

  return zahteva;
}

async function sendInquiryOfferEmail(input: {
  inquiryId: string;
  projectId: string;
  offerId: string;
  to: string;
  templateKey: string | null;
}) {
  try {
    // sendOfferCommunicationEmail requires a template (no built-in default),
    // so fall back to the first active offer_send template when none is configured.
    let templateKey = input.templateKey;
    if (!templateKey) {
      const fallback = await CommunicationTemplateModel.findOne({ category: 'offer_send', isActive: true })
        .sort({ createdAt: 1 })
        .lean();
      templateKey = (fallback as any)?.key ?? null;
    }
    await sendOfferCommunicationEmail({
      projectId: input.projectId,
      offerId: input.offerId,
      to: [input.to],
      templateKey,
      actorDisplayName: 'Spletna stran',
    });
    await WebInquiryModel.updateOne(
      { _id: input.inquiryId },
      { $set: { emailSent: true, status: 'ponudba_poslana', errorMessage: null } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Napaka pri pošiljanju emaila.';
    console.error('[web-inquiries] Pošiljanje ponudbe po emailu ni uspelo:', message);
    await WebInquiryModel.updateOne(
      { _id: input.inquiryId },
      { $set: { emailSent: false, status: 'ponudba_ni_poslana', errorMessage: message } }
    ).catch(() => undefined);
  }
}

export interface ProcessInquiryResult {
  inquiry: WebInquiryDocument;
  offerNumber: string | null;
  offerTotalWithVat: number | null;
  emailSent: boolean;
  message: string;
}

export async function processWebInquiry(payload: WebInquiryPayload, tenantId = 'inteligent'): Promise<ProcessInquiryResult> {
  const settings = await getWebInquirySettings(tenantId);
  if (!settings.enabled) {
    throw new WebInquiryError('NOT_CONFIGURED', 'Sprejem spletnih povpraševanj je izklopljen.', 503);
  }

  const defaultsApplied: string[] = [];

  const inquiry = await WebInquiryModel.create({
    tenantId,
    pillar: payload.pillar,
    status: 'novo',
    contact: payload.contact,
    payload: payload.videonadzor ? { videonadzor: payload.videonadzor } : {},
    note: payload.note,
    source: payload.source,
    defaultsApplied: [],
  });

  try {
    const client = await findOrCreateClient(payload.contact, payload.note, defaultsApplied);
    inquiry.clientId = client._id as Types.ObjectId;

    if (payload.pillar !== 'videonadzor' || !payload.videonadzor) {
      // Other pillars: record + CRM entry only; the offer engine path is enabled per pillar.
      inquiry.defaultsApplied = defaultsApplied;
      await inquiry.save();
      return {
        inquiry,
        offerNumber: null,
        offerTotalWithVat: null,
        emailSent: false,
        message: 'Povpraševanje smo prejeli. Kontaktirali vas bomo v najkrajšem času.',
      };
    }

    const project = await createProjectForInquiry({
      clientName: client.name,
      siteAddressFull: payload.contact.siteAddress.full,
      pillar: payload.pillar,
      category: 'videonadzor',
      note: payload.note,
    });
    if (!project) {
      throw new WebInquiryError('ENGINE_ERROR', 'Projekta ni bilo mogoče ustvariti.', 502);
    }
    inquiry.projectId = project.id;

    const zahteva = await buildVideonadzorZahteva({
      projectMongoId: project._id as Types.ObjectId,
      projectId: project.id,
      cameraCount: payload.videonadzor.cameraCount,
      wiringType: payload.videonadzor.wiringType,
      wiringReady: payload.videonadzor.wiringReady,
      settings,
      defaultsApplied,
    });
    inquiry.zahtevaId = zahteva._id as Types.ObjectId;

    let offer;
    try {
      offer = await nadaljujNaPonudbo(String(zahteva._id), tenantId);
    } catch (error) {
      throw new WebInquiryError(
        'ENGINE_ERROR',
        `Ponudbe ni bilo mogoče izdelati: ${error instanceof Error ? error.message : 'neznana napaka'}`,
        502
      );
    }
    inquiry.offerId = offer._id as Types.ObjectId;
    inquiry.offerNumber = offer.documentNumber ?? offer.title ?? null;
    inquiry.offerTotalWithVat = offer.totalWithVat ?? offer.totalGrossAfterDiscount ?? offer.totalGross ?? null;

    if (!settings.autoSendEmail) {
      defaultsApplied.push('Samodejno pošiljanje emaila je izklopljeno v nastavitvah.');
    }
    inquiry.status = 'ponudba_ni_poslana';
    inquiry.defaultsApplied = defaultsApplied;
    await inquiry.save();

    if (settings.autoSendEmail) {
      // Email (PDF + SMTP) can take longer than the website's request timeout,
      // so it runs after the response; the inquiry record tracks the outcome.
      void sendInquiryOfferEmail({
        inquiryId: String(inquiry._id),
        projectId: project.id,
        offerId: String(offer._id),
        to: payload.contact.email,
        templateKey: settings.emailTemplateKey ?? null,
      });
    }

    return {
      inquiry,
      offerNumber: inquiry.offerNumber,
      offerTotalWithVat: inquiry.offerTotalWithVat,
      emailSent: false,
      message: 'Povpraševanje smo prejeli. Informativno ponudbo vam pošiljamo na vaš e-naslov.',
    };
  } catch (error) {
    inquiry.status = 'napaka';
    inquiry.errorMessage = error instanceof Error ? error.message : 'Neznana napaka.';
    inquiry.defaultsApplied = defaultsApplied;
    await inquiry.save().catch(() => undefined);
    throw error;
  }
}

export async function getWebInquiryOptions(tenantId = 'inteligent') {
  const settings = await getWebInquirySettings(tenantId);
  const video = settings.videonadzor;
  const productIds = [video.wifiCameraProductId, video.wiredCameraProductId].filter(Boolean);
  const products = productIds.length > 0 ? await ProductModel.find({ _id: { $in: productIds } }).lean() : [];
  const productById = new Map<string, any>(products.map((product) => [String(product._id), product]));

  function cameraOption(key: 'wifi' | 'wired', productId: Types.ObjectId | null) {
    const product = productId ? productById.get(String(productId)) : null;
    if (!product) return null;
    const vat = Number((product as any)?.aaData?.vat);
    const vatRate = Number.isFinite(vat) && vat >= 0 ? vat : 22;
    return {
      key,
      name: product.ime,
      shortDescription: product.kratekOpis ?? '',
      priceWithVat: Number((Number(product.prodajnaCena ?? 0) * (1 + vatRate / 100)).toFixed(2)),
    };
  }

  return {
    enabled: settings.enabled,
    pillars: {
      videonadzor: {
        enabled: Boolean(video.wifiCameraProductId || video.wiredCameraProductId),
        cameraCount: { min: 1, max: 64 },
        wiringRule: 'Do 3 kamere praviloma WiFi, 4 ali več priporočamo žično izvedbo.',
        cameras: [cameraOption('wifi', video.wifiCameraProductId), cameraOption('wired', video.wiredCameraProductId)].filter(
          Boolean
        ),
        dniSnemanja: video.dniSnemanja,
      },
      alarm: { enabled: false },
      domofon: { enabled: false },
      pametni_dom: { enabled: false },
    },
  };
}
