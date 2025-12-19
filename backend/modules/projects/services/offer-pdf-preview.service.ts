import type { OfferLineItem, OfferVersion } from '../../../../shared/types/offers';
import { OfferVersionModel } from '../schemas/offer-version';
import { ProjectModel } from '../schemas/project';
import { getSettings } from '../../settings/settings.service';
import type { DocumentTypeKey } from '../../settings/Settings';
import {
  getCompanySettings,
  getOfferPdfOverride,
  getPdfDocumentSettings,
} from './pdf-settings.service';
import {
  DocumentNumberingKind,
  getDocumentNumberingConfig,
  formatNumberExample,
} from './document-numbering.service';
import { renderDocumentHtml, type DocumentPreviewContext } from './document-renderers';
import { renderHtmlToPdf } from './html-pdf.service';

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
  company: CompanyProfile;
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

type CompanySettingsResult = Awaited<ReturnType<typeof getCompanySettings>>;
type GlobalSettingsResult = Awaited<ReturnType<typeof getSettings>>;

export type CompanyProfile = CompanySettingsResult & {
  primaryColor?: string;
  website?: string;
};

const SUPPORTED_DOC_TYPES: DocumentNumberingKind[] = [
  'OFFER',
  'INVOICE',
  'PURCHASE_ORDER',
  'DELIVERY_NOTE',
  'WORK_ORDER',
  'WORK_ORDER_CONFIRMATION',
  'CREDIT_NOTE',
];

const DOC_KIND_TO_SETTINGS_KEY: Record<DocumentNumberingKind, DocumentTypeKey> = {
  OFFER: 'offer',
  INVOICE: 'invoice',
  PURCHASE_ORDER: 'materialOrder',
  DELIVERY_NOTE: 'deliveryNote',
  WORK_ORDER: 'workOrder',
  WORK_ORDER_CONFIRMATION: 'workOrderConfirmation',
  CREDIT_NOTE: 'creditNote',
};

function normalizeDocType(input?: string): DocumentNumberingKind {
  const value = (input ?? 'OFFER').toUpperCase();
  return SUPPORTED_DOC_TYPES.includes(value as DocumentNumberingKind) ? (value as DocumentNumberingKind) : 'OFFER';
}

function buildCompanyProfile(company: CompanySettingsResult, settings: GlobalSettingsResult): CompanyProfile {
  const addressParts = [
    settings.address,
    [settings.postalCode, settings.city].filter(Boolean).join(' ').trim(),
    settings.country,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => !!value);

  return {
    ...company,
    companyName: settings.companyName || company.companyName,
    address: addressParts.length ? addressParts.join('\n') : company.address,
    email: settings.email || company.email,
    phone: settings.phone || company.phone,
    vatId: settings.vatId || company.vatId,
    iban: settings.iban || company.iban,
    directorName: settings.directorName || company.directorName,
    logoUrl: settings.logoUrl || company.logoUrl,
    primaryColor: settings.primaryColor || company.primaryColor || '#0f62fe',
    website: settings.website || undefined,
  };
}

function buildSelectedNotes(
  settings: GlobalSettingsResult,
  docType: DocumentNumberingKind,
  pdfSettings: Awaited<ReturnType<typeof getPdfDocumentSettings>>,
  overrides?: { paymentTerms?: string | null; disclaimer?: string | null },
) {
  const settingsKey = DOC_KIND_TO_SETTINGS_KEY[docType] ?? 'offer';
  const selectedIds = settings.noteDefaultsByDoc?.[settingsKey] ?? [];
  const noteLookup = new Map((settings.notes ?? []).map((note) => [note.id, note]));

  const selectedNotes = selectedIds
    .map((id) => noteLookup.get(id))
    .filter((note): note is GlobalSettingsResult['notes'][number] => !!note)
    .map((note) => note.text?.trim() || note.title?.trim() || '')
    .filter((text): text is string => !!text);

  const payments = overrides?.paymentTerms ?? pdfSettings.defaultTexts.paymentTerms;
  const disclaimer = overrides?.disclaimer ?? pdfSettings.defaultTexts.disclaimer;
  if (payments) {
    selectedNotes.push(payments);
  }
  if (disclaimer) {
    selectedNotes.push(disclaimer);
  }

  return selectedNotes;
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

export async function buildOfferPdfPreviewPayload(
  offerVersionId: string,
  options?: PreviewOptions,
): Promise<OfferPdfPreviewPayload> {
  const docType = normalizeDocType(options?.docType);
  const isDemoRequest = offerVersionId === 'demo';
  const [company, documentSettings, numberingConfig, globalSettings] = await Promise.all([
    getCompanySettings(),
    getPdfDocumentSettings(docType),
    getDocumentNumberingConfig(docType),
    getSettings(),
  ]);
  let companyProfile = buildCompanyProfile(company, globalSettings);

  let offer: OfferVersion | null = null;
  let project: PreviewProjectInfo | null = null;

  if (isDemoRequest) {
    if (!options?.allowDemo) {
      throw new Error('Demo predogled ni omogočen.');
    }
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
  } else {
    const offerDoc = await OfferVersionModel.findById(offerVersionId).lean();
    if (offerDoc) {
      offer = serializeOffer(offerDoc);
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
    } else if (options?.allowDemo) {
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
  companyProfile = {
    ...companyProfile,
    email: overrides?.companyEmail ?? companyProfile.email,
    phone: overrides?.companyPhone ?? companyProfile.phone,
  };

  const items = (offerWithTexts.items ?? []).map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    total: item.totalGross ?? item.totalNet ?? item.totalVat ?? 0,
    vatPercent: item.vatRate ?? 22,
  }));

  const notes = buildSelectedNotes(globalSettings, docType, documentSettings, {
    paymentTerms: overrides?.paymentTerms ?? offerWithTexts.paymentTerms,
    disclaimer: overrides?.disclaimer ?? null,
  });

  const context: DocumentPreviewContext = {
    docType,
    documentNumber: generatedNumber,
    issueDate: new Date().toLocaleDateString('sl-SI'),
    company: companyProfile,
    customer: project
      ? { name: project.customerName, address: project.customerAddress, taxId: project.customerTaxId }
      : undefined,
    projectTitle: project?.title ?? offerWithTexts.title ?? 'Projekt',
    validUntil: offerWithTexts.validUntil ?? null,
    paymentTerms: offerWithTexts.paymentTerms ?? documentSettings.defaultTexts.paymentTerms ?? null,
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
    tasks: docType === 'WORK_ORDER' || docType === 'WORK_ORDER_CONFIRMATION'
      ? items.map((item) => ({ label: item.name, status: docType === 'WORK_ORDER' ? 'in-progress' : 'done' }))
      : undefined,
  };

  const html = renderDocumentHtml(context);

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

export async function generateOfferDocumentPdf(
  offerVersionId: string,
  docType: DocumentNumberingKind,
  options?: Omit<PreviewOptions, 'docType'>,
) {
  const payload = await buildOfferPdfPreviewPayload(offerVersionId, { ...(options ?? {}), docType });
  return renderHtmlToPdf(payload.html);
}
