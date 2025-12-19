import type { OfferLineItem, OfferVersion } from '../../../../shared/types/offers';
import { OfferVersionModel } from '../schemas/offer-version';
import { ProjectModel } from '../schemas/project';
import {
  getCompanySettings,
  getOfferPdfOverride,
  getPdfDocumentSettings,
} from './pdf-settings.service';
import { getSettings } from '../../settings/settings.service';
import type { DocumentTypeKey, Note } from '../../settings/Settings';
import {
  DocumentNumberingKind,
  getDocumentNumberingConfig,
  formatNumberExample,
} from './document-numbering.service';
import {
  renderCreditNotePdf,
  renderDeliveryNotePdf,
  renderInvoicePdf,
  renderOfferPdf,
  renderPurchaseOrderPdf,
  renderWorkOrderConfirmationPdf,
  renderWorkOrderPdf,
  type DocumentPreviewContext,
  type PreviewTask,
} from './document-renderers';

interface PreviewProjectInfo {
  id: string;
  code: string;
  projectNumber?: number;
  title: string;
  customerName: string;
  customerAddress?: string;
  customerTaxId?: string;
}

export interface OfferPdfPreviewPayload {
  company: Awaited<ReturnType<typeof getCompanySettings>>;
  document: {
    settings: Awaited<ReturnType<typeof getPdfDocumentSettings>>;
    generatedNumber: string;
    previewSequence: number;
    numberingPattern: string;
    numberingExample: string;
  };
  offer: OfferVersion;
  project?: PreviewProjectInfo | null;
  overrides?: {
    companyEmail?: string;
    companyPhone?: string;
    paymentTerms?: string;
    disclaimer?: string;
    documentNumberOverride?: string;
    documentNumberReason?: string;
  } | null;
  docType: DocumentNumberingKind;
  html: string;
}

interface PreviewOptions {
  docType?: string;
  allowDemo?: boolean;
}

const DOC_RENDERERS: Record<DocumentNumberingKind, (context: DocumentPreviewContext) => string> = {
  OFFER: renderOfferPdf,
  INVOICE: renderInvoicePdf,
  PURCHASE_ORDER: renderPurchaseOrderPdf,
  DELIVERY_NOTE: renderDeliveryNotePdf,
  WORK_ORDER: renderWorkOrderPdf,
  WORK_ORDER_CONFIRMATION: renderWorkOrderConfirmationPdf,
  CREDIT_NOTE: renderCreditNotePdf,
};

interface NormalizedDocType {
  value: DocumentNumberingKind;
  requested: string;
  isSupported: boolean;
}

function normalizeDocType(input?: string): NormalizedDocType {
  const requested = (input ?? 'OFFER').toUpperCase();
  if (requested in DOC_RENDERERS) {
    return {
      value: requested as DocumentNumberingKind,
      requested,
      isSupported: true,
    };
  }

  return {
    value: 'OFFER',
    requested,
    isSupported: requested === 'OFFER',
  };
}

const DOC_TYPE_TO_SETTINGS_KEY: Record<DocumentNumberingKind, DocumentTypeKey> = {
  OFFER: 'offer',
  INVOICE: 'invoice',
  PURCHASE_ORDER: 'materialOrder',
  DELIVERY_NOTE: 'deliveryNote',
  WORK_ORDER: 'workOrder',
  WORK_ORDER_CONFIRMATION: 'workOrderConfirmation',
  CREDIT_NOTE: 'creditNote',
};

function formatCompanyAddress(settings: Awaited<ReturnType<typeof getSettings>>) {
  const lineTwo = [settings.postalCode, settings.city].filter(Boolean).join(' ').trim();
  const parts = [settings.address, lineTwo || '', settings.country ?? '']
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value);
  return parts.join(', ');
}

function mergeCompanyBranding(
  company: Awaited<ReturnType<typeof getCompanySettings>>,
  settings: Awaited<ReturnType<typeof getSettings>>,
) {
  return {
    ...company,
    companyName: settings.companyName || company.companyName,
    address: formatCompanyAddress(settings) || company.address,
    email: settings.email || company.email,
    phone: settings.phone || company.phone,
    vatId: settings.vatId || company.vatId,
    iban: settings.iban || company.iban,
    directorName: settings.directorName || company.directorName,
    logoUrl: settings.logoUrl || company.logoUrl,
  };
}

function collectDocumentNotes(
  docType: DocumentNumberingKind,
  settings: Awaited<ReturnType<typeof getSettings>>,
  documentSettings: Awaited<ReturnType<typeof getPdfDocumentSettings>>,
) {
  const docKey = DOC_TYPE_TO_SETTINGS_KEY[docType] ?? 'offer';
  const defaults = settings.noteDefaultsByDoc?.[docKey] ?? [];
  const noteMap = new Map<string, string>(
    (settings.notes ?? []).map((note: Note) => [note.id, note.text]),
  );
  const orderedNotes: string[] = [];
  const seen = new Set<string>();
  defaults.forEach((noteId) => {
    const text = noteMap.get(noteId);
    if (!text) return;
    const trimmed = text.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    orderedNotes.push(trimmed);
  });
  const paymentTerms = documentSettings.defaultTexts.paymentTerms?.trim();
  if (paymentTerms && !seen.has(paymentTerms)) {
    seen.add(paymentTerms);
    orderedNotes.push(paymentTerms);
  }
  const disclaimer = documentSettings.defaultTexts.disclaimer?.trim();
  if (disclaimer && !seen.has(disclaimer)) {
    seen.add(disclaimer);
    orderedNotes.push(disclaimer);
  }
  return orderedNotes;
}

const DEMO_ITEMS: OfferLineItem[] = [
  {
    id: 'item-1',
    productId: null,
    name: 'LED panel 60x60',
    quantity: 12,
    unit: 'kos',
    unitPrice: 85,
    vatRate: 22,
    totalNet: 1020,
    totalVat: 224.4,
    totalGross: 1244.4,
    discountPercent: 0,
  },
  {
    id: 'item-2',
    productId: null,
    name: 'Montaža in konfiguracija',
    quantity: 8,
    unit: 'h',
    unitPrice: 45,
    vatRate: 22,
    totalNet: 360,
    totalVat: 79.2,
    totalGross: 439.2,
    discountPercent: 0,
  },
];

const DEMO_WORK_ORDER_TASKS: PreviewTask[] = [
  { label: 'Montaza kamere', status: 'in-progress' },
  { label: 'Test signalnih poti', status: 'todo' },
  { label: 'Konfiguracija snemalnika', status: 'todo' },
  { label: 'Predaja uporabniku', status: 'todo' },
];

const DEMO_WORK_ORDER_CONFIRMATION_TASKS: PreviewTask[] = [
  { label: 'Montaza kamere', status: 'done' },
  { label: 'Test signalnih poti', status: 'done' },
  { label: 'Konfiguracija snemalnika', status: 'done' },
  { label: 'Predaja uporabniku', status: 'done' },
];

function buildDemoOffer(): OfferVersion {
  const totalNet = DEMO_ITEMS.reduce((sum, item) => sum + item.totalNet, 0);
  const totalVat = DEMO_ITEMS.reduce((sum, item) => sum + item.totalVat, 0);
  const totalGross = DEMO_ITEMS.reduce((sum, item) => sum + item.totalGross, 0);
  const now = new Date().toISOString();

  return {
    _id: 'demo-offer',
    projectId: 'PRJ-000',
    baseTitle: 'Ponudba',
    versionNumber: 1,
    title: 'Ponudba PRJ-000',
    validUntil: now,
    paymentTerms: 'Plačilo v 15 dneh po izstavitvi računa.',
    introText: null,
    comment: 'Ta komentar je primer prikaza pod izračunom.',
    items: DEMO_ITEMS,
    totalNet,
    totalVat22: totalVat,
    totalVat95: 0,
    totalVat,
    totalGross,
    discountPercent: 0,
    globalDiscountPercent: 0,
    discountAmount: 0,
    totalNetAfterDiscount: totalNet,
    totalGrossAfterDiscount: totalGross,
    useGlobalDiscount: true,
    usePerItemDiscount: false,
    vatMode: 22,
    baseWithoutVat: totalNet,
    perItemDiscountAmount: 0,
    globalDiscountAmount: 0,
    baseAfterDiscount: totalNet,
    vatAmount: totalVat,
    totalWithVat: totalGross,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  } as OfferVersion;
}

function serializeOffer(offer: any): OfferVersion {
  return {
    ...offer,
    _id: offer._id?.toString?.() ?? offer._id,
    validUntil: offer.validUntil ? new Date(offer.validUntil).toISOString() : null,
    createdAt: offer.createdAt ? new Date(offer.createdAt).toISOString() : '',
    updatedAt: offer.updatedAt ? new Date(offer.updatedAt).toISOString() : '',
  } as OfferVersion;
}

function buildUnsupportedPreviewHtml(requestedDocType: string) {
  const label = requestedDocType || 'ta dokument';
  return `<!doctype html>
  <html lang="sl">
    <head>
      <meta charset="UTF-8" />
      <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #f8fafc; color: #111827; margin: 0; padding: 24px; }
        .card { max-width: 720px; margin: 64px auto; background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); padding: 32px; text-align: center; }
        h1 { margin-bottom: 12px; }
        p { margin: 0; color: #6b7280; }
      </style>
      <title>Predogled ni na voljo</title>
    </head>
    <body>
      <div class="card">
        <h1>Predogled ni na voljo</h1>
        <p>Predogled se še ni implementiran za dokument <strong>${label}</strong>.</p>
      </div>
    </body>
  </html>`;
}

function getDemoTasks(docType: DocumentNumberingKind, allowDemo: boolean): PreviewTask[] | undefined {
  if (!allowDemo) {
    return undefined;
  }
  if (docType === 'WORK_ORDER') {
    return DEMO_WORK_ORDER_TASKS;
  }
  if (docType === 'WORK_ORDER_CONFIRMATION') {
    return DEMO_WORK_ORDER_CONFIRMATION_TASKS;
  }
  return undefined;
}

export async function buildOfferPdfPreviewPayload(
  offerVersionId: string,
  options?: PreviewOptions,
): Promise<OfferPdfPreviewPayload> {
  const docTypeInfo = normalizeDocType(options?.docType);
  const docType = docTypeInfo.value;
  const allowDemo = Boolean(options?.allowDemo);
  const [rawCompany, documentSettings, numberingConfig, globalSettings] = await Promise.all([
    getCompanySettings(),
    getPdfDocumentSettings(docType),
    getDocumentNumberingConfig(docType),
    getSettings(),
  ]);
  const company = mergeCompanyBranding(rawCompany, globalSettings);

  let offerDoc: OfferVersion | null = null;
  try {
    const rawDoc = await OfferVersionModel.findById(offerVersionId).lean();
    offerDoc = rawDoc ? serializeOffer(rawDoc) : null;
  } catch (error) {
    if ((error as Error)?.name !== 'CastError') {
      throw error;
    }
    if (!allowDemo) {
      throw new Error('Ponudba ni najdena.');
    }
  }

  let offer: OfferVersion | null = offerDoc;
  let project: PreviewProjectInfo | null = null;

  if (offerDoc) {
    const projectDoc = await ProjectModel.findOne({ id: offerDoc.projectId }).lean();
    if (projectDoc) {
      project = {
        id: projectDoc.id,
        code: projectDoc.code,
        projectNumber: projectDoc.projectNumber,
        title: projectDoc.title,
        customerName: projectDoc.customer?.name ?? '',
        customerAddress: projectDoc.customer?.address ?? '',
        customerTaxId: projectDoc.customer?.taxId ?? '',
      };
    }
  } else if (allowDemo) {
    offer = buildDemoOffer();
    project = {
      id: 'PRJ-000',
      code: 'PRJ-000',
      projectNumber: 0,
      title: 'Demo projekt',
      customerName: 'Demo naročnik',
      customerAddress: 'Glavna cesta 1, Ljubljana',
      customerTaxId: 'SI12345678',
    };
  }

  if (!offer) {
    throw new Error('Ponudba ni najdena.');
  }

  const overrides = await getOfferPdfOverride(offer._id?.toString?.() ?? offer._id);
  const fallbackCreatedAt = offer.createdAt ? new Date(offer.createdAt) : new Date();
  const numberingExample = formatNumberExample(numberingConfig.pattern, new Date(), 1, numberingConfig.yearOverride, docType);
  const fallbackNumber = formatNumberExample(
    numberingConfig.pattern,
    fallbackCreatedAt,
    1,
    numberingConfig.yearOverride,
    docType,
  );
  const generatedNumber =
    overrides?.documentNumberOverride ?? offer.documentNumber ?? fallbackNumber;

  const offerWithTexts: OfferVersion = {
    ...offer,
    paymentTerms: overrides?.paymentTerms ?? offer.paymentTerms ?? documentSettings.defaultTexts.paymentTerms ?? '',
  };

  const items = (offerWithTexts.items ?? []).map((item, index) => ({
    code: item.productId ?? `ITEM-${String(index + 1).padStart(2, '0')}`,
    description: item.name,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    total: item.totalGross ?? item.totalNet ?? item.totalVat ?? 0,
    vatPercent: item.vatRate ?? 22,
  }));

  const notes = collectDocumentNotes(docType, globalSettings, documentSettings);

  const renderer = DOC_RENDERERS[docType] ?? renderOfferPdf;
  const demoTasks = getDemoTasks(docType, allowDemo);
  const fallbackTasks: PreviewTask[] | undefined =
    docType === 'WORK_ORDER' || docType === 'WORK_ORDER_CONFIRMATION'
      ? items.map<PreviewTask>((item) => ({
          label: item.name,
          status: docType === 'WORK_ORDER' ? 'in-progress' : 'done',
        }))
      : undefined;
  const context: DocumentPreviewContext = {
    docType,
    documentNumber: generatedNumber,
    issueDate: new Date().toLocaleDateString('sl-SI'),
    company,
    companyWebsite: globalSettings.website?.trim() || undefined,
    companyPrimaryColor: globalSettings.primaryColor || undefined,
    customer: project
      ? { name: project.customerName, address: project.customerAddress, taxId: project.customerTaxId }
      : undefined,
    projectTitle: project?.title ?? offerWithTexts.title ?? 'Projekt',
    items,
    totals: {
      subtotal: offerWithTexts.totalNet ?? 0,
      vat: offerWithTexts.totalVat ?? 0,
      total: offerWithTexts.totalGross ?? 0,
      discount: offerWithTexts.discountAmount ?? 0,
      dueDays: docType === 'INVOICE' ? 15 : undefined,
    },
    notes,
    comment: docType === 'OFFER' ? offerWithTexts.comment ?? null : null,
    referenceNumber: docType === 'CREDIT_NOTE' ? generatedNumber.replace('DOBROPIS', 'RACUN') : null,
    tasks: demoTasks ?? fallbackTasks,
  };

  const html = docTypeInfo.isSupported ? renderer(context) : buildUnsupportedPreviewHtml(docTypeInfo.requested);

  return {
    company,
    document: {
      settings: documentSettings,
      generatedNumber,
      previewSequence: documentSettings.numberingRule.nextSequence,
      numberingPattern: numberingConfig.pattern,
      numberingExample,
    },
    offer: offerWithTexts,
    project,
    overrides: overrides
      ? {
          companyEmail: overrides.companyEmail,
          companyPhone: overrides.companyPhone,
          paymentTerms: overrides.paymentTerms,
          disclaimer: overrides.disclaimer,
          documentNumberOverride: overrides.documentNumberOverride,
          documentNumberReason: overrides.documentNumberReason,
        }
      : null,
    docType,
    html,
  };
}
