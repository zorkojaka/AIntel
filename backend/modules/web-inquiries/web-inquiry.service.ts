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
import { calculateOfferTotals } from '../projects/services/offer-totals.service';
import { OfferVersionModel } from '../projects/schemas/offer-version';
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
  company: { name: string; taxId: string } | null;
}

export interface WebInquiryPayload {
  pillar: WebInquiryPillar;
  contact: WebInquiryContact;
  videonadzor?: {
    cameraCount: number;
    wiringType: 'wifi' | 'wired';
    wiringReady: boolean;
  };
  alarm?: {
    sensorChoice: 'A' | 'B' | 'C';
    sensorCount: number;
    wiredAlarm: boolean;
    addSirensAndKeypad: boolean;
    addFireSensors: boolean;
    addCO: boolean;
  };
  domofon?: {
    indoorUnits: number;
    outdoorUnits: number;
    wiringReady: boolean;
  };
  pametniDom?: {
    lightsCount: number;
    shadesCount: number;
  };
  note?: string;
  source?: string;
  meta?: Record<string, string>;
}

const PILLARS: WebInquiryPillar[] = ['videonadzor', 'alarm', 'domofon', 'pametni_dom', 'pametna_kljucavnica', 'servis'];
export const PILLAR_LABELS: Record<WebInquiryPillar, string> = {
  videonadzor: 'Videonadzor',
  alarm: 'Alarm',
  domofon: 'Domofon',
  pametni_dom: 'Pametni dom',
  pametna_kljucavnica: 'Pametna ključavnica',
  servis: 'Servis',
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
    company: null,
  };

  const companySource = (contactSource.company ?? null) as Record<string, unknown> | null;
  if (companySource && typeof companySource === 'object') {
    const companyName = cleanString(companySource.name, 160);
    const taxId = cleanString(companySource.taxId, 20).toUpperCase().replace(/\s/g, '');
    if (!companyName || !taxId) {
      throw new WebInquiryError('VALIDATION_ERROR', 'Za podjetje sta obvezna naziv in davčna številka.', 400);
    }
    contact.company = { name: companyName, taxId };
  }

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

  // meta: flat string map for context (objectType, qualityLevel, utm_*, gclid, landingPage ...)
  const meta: Record<string, string> = {};
  const metaSource = (source.meta ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(metaSource).slice(0, 20)) {
    const cleanKey = cleanString(key, 40).replace(/[^a-zA-Z0-9_.-]/g, '');
    const value = cleanString(metaSource[key], 300);
    if (cleanKey && value) meta[cleanKey] = value;
  }

  const payload: WebInquiryPayload = {
    pillar,
    contact,
    note: cleanString(source.note, 1000),
    source: cleanString(source.source, 120) || 'web',
    meta,
  };

  function celoStevilo(value: unknown, min: number, max: number, polje: string) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new WebInquiryError('VALIDATION_ERROR', `Polje ${polje} mora biti celo število med ${min} in ${max}.`, 400);
    }
    return n;
  }
  const bool = (value: unknown) => value === true || value === 'true';

  if (pillar === 'videonadzor') {
    const video = (source.videonadzor ?? {}) as Record<string, unknown>;
    const cameraCount = celoStevilo(video.cameraCount, 1, 64, 'videonadzor.cameraCount');
    const wiringType = cleanString(video.wiringType, 10);
    if (wiringType !== 'wifi' && wiringType !== 'wired') {
      throw new WebInquiryError('VALIDATION_ERROR', 'Tip ožičenja (videonadzor.wiringType) mora biti "wifi" ali "wired".', 400);
    }
    payload.videonadzor = { cameraCount, wiringType, wiringReady: bool(video.wiringReady) };
  }

  if (pillar === 'alarm') {
    const alarm = (source.alarm ?? {}) as Record<string, unknown>;
    const sensorChoice = cleanString(alarm.sensorChoice, 1).toUpperCase();
    if (!['A', 'B', 'C'].includes(sensorChoice)) {
      throw new WebInquiryError('VALIDATION_ERROR', 'Izbira senzorja (alarm.sensorChoice) mora biti A, B ali C.', 400);
    }
    payload.alarm = {
      sensorChoice: sensorChoice as 'A' | 'B' | 'C',
      sensorCount: celoStevilo(alarm.sensorCount, 1, 30, 'alarm.sensorCount'),
      wiredAlarm: bool(alarm.wiredAlarm),
      addSirensAndKeypad: bool(alarm.addSirensAndKeypad),
      addFireSensors: bool(alarm.addFireSensors),
      addCO: bool(alarm.addCO),
    };
  }

  if (pillar === 'domofon') {
    const domofon = (source.domofon ?? {}) as Record<string, unknown>;
    payload.domofon = {
      indoorUnits: celoStevilo(domofon.indoorUnits, 1, 30, 'domofon.indoorUnits'),
      outdoorUnits: celoStevilo(domofon.outdoorUnits, 1, 10, 'domofon.outdoorUnits'),
      wiringReady: bool(domofon.wiringReady),
    };
  }

  if (pillar === 'pametni_dom') {
    const dom = (source.pametniDom ?? {}) as Record<string, unknown>;
    const lightsCount = celoStevilo(dom.lightsCount ?? 0, 0, 60, 'pametniDom.lightsCount');
    const shadesCount = celoStevilo(dom.shadesCount ?? 0, 0, 60, 'pametniDom.shadesCount');
    if (lightsCount + shadesCount < 1) {
      throw new WebInquiryError('VALIDATION_ERROR', 'Izberite vsaj eno napravo (luči ali senčila).', 400);
    }
    payload.pametniDom = { lightsCount, shadesCount };
  }

  return payload;
}

async function findOrCreateClient(contact: WebInquiryContact, note: string | undefined, defaultsApplied: string[]) {
  if (contact.company) {
    // Podjetje: poisci po davcni ali imenu, sicer ustvari nov zapis tipa company.
    const obstojece =
      (await CrmClientModel.findOne({ vat_number: contact.company.taxId, isActive: true })) ||
      (await CrmClientModel.findOne({ name: contact.company.name, type: 'company', isActive: true }));
    if (obstojece) {
      defaultsApplied.push(`Podjetje najdeno v CRM: ${obstojece.name}.`);
      return obstojece;
    }
    defaultsApplied.push(`Novo podjetje v CRM: ${contact.company.name} (${contact.company.taxId}).`);
    return CrmClientModel.create({
      name: contact.company.name,
      type: 'company',
      vat_number: contact.company.taxId,
      email: contact.email,
      phone: contact.phone,
      contact_person: `${contact.firstName} ${contact.lastName}`.trim(),
      street: contact.siteAddress.street,
      postalCode: contact.siteAddress.postalCode,
      postalCity: contact.siteAddress.city,
      address: contact.siteAddress.full,
      tags: ['spletno-povprasevanje'],
      notes: note || undefined,
      isActive: true,
    });
  }

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
  clientId: Types.ObjectId;
  clientName: string;
  siteAddressFull: string;
  pillar: WebInquiryPillar;
  category: string;
  note?: string;
  taxId?: string;
}) {
  const { id, code, projectNumber } = await generateProjectIdentifiers();
  const project: Project = {
    id,
    code,
    projectNumber,
    clientId: input.clientId,
    title: `${PILLAR_LABELS[input.pillar]} – ${input.clientName}`,
    customer: {
      name: input.clientName,
      taxId: input.taxId,
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

async function izracunajKilometrino(projectId: string, defaultsApplied: string[]) {
  try {
    const route = await calculateProjectRouteDistance(projectId);
    defaultsApplied.push(`Kilometrina: ${route.razdaljaSkupaj} km (samodejni izračun, zanesljivost ${route.zanesljivost}).`);
    return route.razdaljaSkupaj;
  } catch (error) {
    defaultsApplied.push(`Kilometrina ni bila izračunana samodejno (${error instanceof Error ? error.message : 'napaka'}) – preveri ročno.`);
    return 0;
  }
}

async function ustvariZahtevo(projectMongoId: Types.ObjectId, sistem: Record<string, unknown>) {
  const zahteva = await ZahtevaModel.create({ projectId: projectMongoId, status: 'osnutek', sistemi: [sistem], createdBy: null });
  await ProjectModel.updateOne(
    { _id: projectMongoId },
    { $addToSet: { requestIds: zahteva._id }, $set: { activeRequestId: zahteva._id } }
  );
  return zahteva;
}

async function productNameOrThrow(productId: Types.ObjectId | null, oznaka: string) {
  if (!productId) {
    throw new WebInquiryError('NOT_CONFIGURED', `V nastavitvah spletnih povpraševanj ni izbran produkt: ${oznaka}.`, 503);
  }
  const product = await ProductModel.findById(productId).lean();
  if (!product) {
    throw new WebInquiryError('NOT_CONFIGURED', `Produkt za "${oznaka}" v ceniku ne obstaja več.`, 503);
  }
  return product;
}

async function buildAlarmZahteva(input: {
  projectMongoId: Types.ObjectId;
  projectId: string;
  data: NonNullable<WebInquiryPayload['alarm']>;
  settings: WebInquirySettingsDocument;
  defaultsApplied: string[];
}) {
  const { settings, defaultsApplied, data } = input;
  const cfg = settings.alarm;
  const sensorId = { A: cfg.sensorAProductId, B: cfg.sensorBProductId, C: cfg.sensorCProductId }[data.sensorChoice];
  const centrala = await productNameOrThrow(cfg.centralaProductId, 'alarmna centrala');
  const senzor = await productNameOrThrow(sensorId, `senzor ${data.sensorChoice}`);
  defaultsApplied.push(`Centrala: ${centrala.ime} (fiksna izbira).`, `Senzor ${data.sensorChoice}: ${senzor.ime} × ${data.sensorCount}.`);

  const sirene: Array<{ productId: string; kolicina: number }> = [];
  const upravljanje: Array<{ productId: string; kolicina: number }> = [];
  const pozarPoplava: Array<{ productId: string; kolicina: number }> = [];
  const dodatnaOprema: Array<{ productId: string; kolicina: number }> = [];
  if (data.addSirensAndKeypad) {
    if (cfg.sirenaZunanjaProductId) sirene.push({ productId: String(cfg.sirenaZunanjaProductId), kolicina: 1 });
    if (cfg.sirenaNotranjaProductId) sirene.push({ productId: String(cfg.sirenaNotranjaProductId), kolicina: 1 });
    if (cfg.tipkovnicaProductId) upravljanje.push({ productId: String(cfg.tipkovnicaProductId), kolicina: 1 });
    defaultsApplied.push('Dodano: zunanja in notranja sirena ter tipkovnica (fiksne izbire).');
  }
  if (data.addFireSensors && cfg.pozarProductId) {
    pozarPoplava.push({ productId: String(cfg.pozarProductId), kolicina: 1 });
    defaultsApplied.push('Dodan: 1 požarni senzor (količino po potrebi prilagodi Jaka).');
  }
  if (data.addCO && cfg.coProductId) {
    dodatnaOprema.push({ productId: String(cfg.coProductId), kolicina: 1 });
    defaultsApplied.push('Dodan: 1 CO senzor.');
  }

  const kilometrinaKm = await izracunajKilometrino(input.projectId, defaultsApplied);
  return ustvariZahtevo(input.projectMongoId, {
    id: 'sys-1',
    tip: 'alarm',
    steviloLokacij: data.sensorCount,
    alarm: {
      centrala: { productId: String(centrala._id) },
      senzorji: [{ id: 'sen-1', senzorProductId: String(senzor._id) }],
      lokacije: Array.from({ length: data.sensorCount }, (_, i) => ({ id: `loc-${i + 1}`, ime: `Prostor ${i + 1}`, senzorIdAssigned: 'sen-1' })),
      sirene,
      upravljanje,
      pozarPoplava,
      dodatnaOprema,
    },
    execution: { scenarioType: cfg.scenario, estimates: { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0, kilometrinaKm } },
  });
}

async function buildPostavkeZahteva(input: {
  projectMongoId: Types.ObjectId;
  projectId: string;
  tip: 'domofon' | 'pametna_hisa';
  postavke: Array<{ productId: Types.ObjectId | null; kolicina: number; oznaka: string }>;
  scenario: string;
  defaultsApplied: string[];
}) {
  const postavke: Array<{ productId: string; kolicina: number }> = [];
  for (const vnos of input.postavke) {
    if (vnos.kolicina <= 0) continue;
    const product = await productNameOrThrow(vnos.productId, vnos.oznaka);
    postavke.push({ productId: String(product._id), kolicina: vnos.kolicina });
    input.defaultsApplied.push(`${vnos.oznaka}: ${product.ime} × ${vnos.kolicina} (fiksna izbira).`);
  }
  if (postavke.length === 0) {
    throw new WebInquiryError('VALIDATION_ERROR', 'Ni izbranih naprav.', 400);
  }
  const kilometrinaKm = await izracunajKilometrino(input.projectId, input.defaultsApplied);
  const kolicinaSkupaj = postavke.reduce((sum, p) => sum + p.kolicina, 0);
  return ustvariZahtevo(input.projectMongoId, {
    id: 'sys-1',
    tip: input.tip,
    steviloLokacij: kolicinaSkupaj,
    [input.tip === 'domofon' ? 'domofon' : 'pametnaHisa']: { postavke },
    execution: { scenarioType: input.scenario, estimates: { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0, kilometrinaKm } },
  });
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
    meta: payload.meta ?? {},
    note: payload.note,
    source: payload.source,
    defaultsApplied: [],
  });

  try {
    const client = await findOrCreateClient(payload.contact, payload.note, defaultsApplied);
    inquiry.clientId = client._id as Types.ObjectId;

    // Ali steber podpira samodejno ponudbo?
    const avtomatski =
      (payload.pillar === 'videonadzor' && !!payload.videonadzor) ||
      (payload.pillar === 'alarm' && !!payload.alarm && !payload.alarm.wiredAlarm) ||
      (payload.pillar === 'domofon' && !!payload.domofon) ||
      (payload.pillar === 'pametni_dom' && !!payload.pametniDom);

    if (!avtomatski) {
      if (payload.pillar === 'alarm' && payload.alarm?.wiredAlarm) {
        defaultsApplied.push('Žični alarm - ponudbo pripravi Jaka ročno (spletna avtomatika pokriva brezžični sistem).');
      }
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

    const metaNoteParts = [payload.note];
    if (payload.meta?.objectType) metaNoteParts.push(`Vrsta objekta: ${payload.meta.objectType}`);
    if (payload.meta?.qualityLevel) metaNoteParts.push(`Želena raven kakovosti: ${payload.meta.qualityLevel}`);
    const kategorija = { videonadzor: 'videonadzor', alarm: 'alarm', domofon: 'domofon', pametni_dom: 'pametna-hisa' }[
      payload.pillar as 'videonadzor' | 'alarm' | 'domofon' | 'pametni_dom'
    ];
    const project = await createProjectForInquiry({
      clientId: client._id as Types.ObjectId,
      clientName: client.name,
      siteAddressFull: payload.contact.siteAddress.full,
      pillar: payload.pillar,
      category: kategorija,
      note: metaNoteParts.filter(Boolean).join(' | '),
      taxId: payload.contact.company?.taxId,
    });
    if (!project) {
      throw new WebInquiryError('ENGINE_ERROR', 'Projekta ni bilo mogoče ustvariti.', 502);
    }
    inquiry.projectId = project.id;

    let zahteva;
    if (payload.pillar === 'videonadzor' && payload.videonadzor) {
      zahteva = await buildVideonadzorZahteva({
        projectMongoId: project._id as Types.ObjectId,
        projectId: project.id,
        cameraCount: payload.videonadzor.cameraCount,
        wiringType: payload.videonadzor.wiringType,
        wiringReady: payload.videonadzor.wiringReady,
        settings,
        defaultsApplied,
      });
    } else if (payload.pillar === 'alarm' && payload.alarm) {
      zahteva = await buildAlarmZahteva({
        projectMongoId: project._id as Types.ObjectId,
        projectId: project.id,
        data: payload.alarm,
        settings,
        defaultsApplied,
      });
    } else if (payload.pillar === 'domofon' && payload.domofon) {
      if (!payload.domofon.wiringReady) defaultsApplied.push('Napeljava za domofon še ni pripravljena - preveri obseg napeljave.');
      zahteva = await buildPostavkeZahteva({
        projectMongoId: project._id as Types.ObjectId,
        projectId: project.id,
        tip: 'domofon',
        postavke: [
          { productId: settings.domofon.notranjaEnotaProductId, kolicina: payload.domofon.indoorUnits, oznaka: 'notranja enota domofona' },
          { productId: settings.domofon.zunanjaEnotaProductId, kolicina: payload.domofon.outdoorUnits, oznaka: 'zunanja enota domofona' },
        ],
        scenario: settings.domofon.scenario,
        defaultsApplied,
      });
    } else {
      zahteva = await buildPostavkeZahteva({
        projectMongoId: project._id as Types.ObjectId,
        projectId: project.id,
        tip: 'pametna_hisa',
        postavke: [
          { productId: settings.pametniDom.modulLuciProductId, kolicina: payload.pametniDom!.lightsCount, oznaka: 'modul za luči' },
          { productId: settings.pametniDom.modulSencilProductId, kolicina: payload.pametniDom!.shadesCount, oznaka: 'modul za senčila' },
        ],
        scenario: settings.pametniDom.scenario,
        defaultsApplied,
      });
    }
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
    // Kolicinski popust po vrednosti ponudbe (lestvica iz nastavitev vticnika).
    let discountPercent = 0;
    const osnovaZDdv = Number(offer.totalGross ?? 0);
    const lestvica = ((settings as any).popusti ?? [])
      .filter((prag: any) => Number(prag?.nad) > 0 && Number(prag?.odstotek) > 0)
      .sort((a: any, b: any) => Number(a.nad) - Number(b.nad));
    for (const prag of lestvica) {
      if (osnovaZDdv >= Number(prag.nad)) discountPercent = Number(prag.odstotek);
    }
    if (discountPercent > 0) {
      const totals = calculateOfferTotals({
        items: offer.items as any,
        usePerItemDiscount: false,
        useGlobalDiscount: true,
        globalDiscountPercent: discountPercent,
        vatMode: 22,
      });
      await OfferVersionModel.updateOne({ _id: offer._id }, {
        $set: {
          discountPercent: totals.discountPercent,
          globalDiscountPercent: discountPercent,
          discountAmount: totals.discountAmount,
          totalNetAfterDiscount: totals.totalNetAfterDiscount,
          totalGrossAfterDiscount: totals.totalGrossAfterDiscount,
          perItemDiscountAmount: totals.perItemDiscountAmount ?? 0,
          globalDiscountAmount: totals.globalDiscountAmount ?? 0,
          baseAfterDiscount: totals.baseAfterDiscount ?? totals.totalNetAfterDiscount ?? 0,
          vatAmount: totals.vatAmount ?? totals.totalVat ?? 0,
          totalWithVat: totals.totalWithVat ?? totals.totalGrossAfterDiscount ?? 0,
          totalVat: totals.totalVat,
          totalVat22: totals.totalVat22,
          totalVat95: totals.totalVat95,
        },
      });
      (offer as any).totalWithVat = totals.totalWithVat ?? totals.totalGrossAfterDiscount;
      defaultsApplied.push(`Količinski popust: ${discountPercent} % (vrednost ponudbe nad ${lestvica.filter((prag: any) => osnovaZDdv >= Number(prag.nad)).pop()?.nad} €).`);
    }

    inquiry.offerId = offer._id as Types.ObjectId;
    inquiry.offerNumber = offer.documentNumber ?? offer.title ?? null;
    inquiry.offerTotalWithVat = offer.totalWithVat ?? offer.totalGrossAfterDiscount ?? offer.totalGross ?? null;
    (inquiry as any).meta = { ...(inquiry.meta ?? {}), discountPercent: discountPercent ? String(discountPercent) : undefined };

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
  const productIds = [
    video.wifiCameraProductId, video.wiredCameraProductId,
    settings.alarm.centralaProductId, settings.alarm.sensorAProductId, settings.alarm.sensorBProductId, settings.alarm.sensorCProductId,
    settings.domofon.notranjaEnotaProductId, settings.domofon.zunanjaEnotaProductId,
    settings.pametniDom.modulLuciProductId, settings.pametniDom.modulSencilProductId,
  ].filter(Boolean);
  const products = productIds.length > 0 ? await ProductModel.find({ _id: { $in: productIds } }).lean() : [];
  const productById = new Map<string, any>(products.map((product) => [String(product._id), product]));

  function option(key: string, productId: Types.ObjectId | null) {
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
        cameras: [option('wifi', video.wifiCameraProductId), option('wired', video.wiredCameraProductId)].filter(Boolean),
        dniSnemanja: video.dniSnemanja,
      },
      alarm: {
        enabled: Boolean(settings.alarm.centralaProductId && (settings.alarm.sensorAProductId || settings.alarm.sensorBProductId)),
        sensors: [
          option('A', settings.alarm.sensorAProductId),
          option('B', settings.alarm.sensorBProductId),
          option('C', settings.alarm.sensorCProductId),
        ].filter(Boolean),
        centrala: option('centrala', settings.alarm.centralaProductId),
      },
      domofon: {
        enabled: Boolean(settings.domofon.notranjaEnotaProductId && settings.domofon.zunanjaEnotaProductId),
        notranjaEnota: option('notranja', settings.domofon.notranjaEnotaProductId),
        zunanjaEnota: option('zunanja', settings.domofon.zunanjaEnotaProductId),
      },
      pametni_dom: {
        enabled: Boolean(settings.pametniDom.modulLuciProductId || settings.pametniDom.modulSencilProductId),
        modulLuci: option('luci', settings.pametniDom.modulLuciProductId),
        modulSencil: option('sencila', settings.pametniDom.modulSencilProductId),
      },
    },
  };
}

const IZDELKI_SKUPINE: Array<{ key: string; label: string; query: Record<string, unknown> }> = [
  { key: 'kamere', label: 'Kamere in videonadzor', query: { 'classification.productType': 'kamera' } },
  { key: 'ajax', label: 'Ajax alarm', query: { categorySlugs: 'ajax' } },
  { key: 'blebox', label: 'Blebox pametni dom', query: { categorySlugs: 'blebox' } },
];

export async function getWebIzdelki(limit = 8) {
  const skupine = [];
  for (const skupina of IZDELKI_SKUPINE) {
    const products = await ProductModel.find({
      ...skupina.query,
      isActive: true,
      prodajnaCena: { $gt: 0 },
      $or: [{ povezavaDoSlike: { $nin: [null, ''] } }, { 'aaData.image': { $nin: [null, ''] } }],
    })
      .sort({ prodajnaCena: -1 })
      .limit(limit)
      .lean();
    skupine.push({
      key: skupina.key,
      label: skupina.label,
      products: products.map((product: any) => {
        const vat = Number(product?.aaData?.vat);
        const vatRate = Number.isFinite(vat) && vat >= 0 ? vat : 22;
        return {
          name: product.ime,
          shortDescription: (product.kratekOpis ?? '').slice(0, 140),
          priceWithVat: Number((Number(product.prodajnaCena ?? 0) * (1 + vatRate / 100)).toFixed(2)),
          image: product.povezavaDoSlike || product?.aaData?.image || '',
        };
      }),
    });
  }
  return skupine;
}
