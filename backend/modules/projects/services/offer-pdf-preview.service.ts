import type { OfferLineItem, OfferVersion } from '../../../../shared/types/offers';
import { OfferVersionModel } from '../schemas/offer-version';
import { ProjectModel } from '../schemas/project';
import {
  getCompanySettings,
  getOfferPdfOverride,
  getPdfDocumentSettings,
} from './pdf-settings.service';
import { getOfferNumberingConfig, formatOfferNumberExample } from './document-numbering.service';

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
}

interface PreviewOptions {
  docType?: string;
  allowDemo?: boolean;
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
  const docType = options?.docType ?? 'OFFER';
  const [company, documentSettings, numberingConfig] = await Promise.all([
    getCompanySettings(),
    getPdfDocumentSettings(docType),
    getOfferNumberingConfig(),
  ]);

  const offerDoc = await OfferVersionModel.findById(offerVersionId).lean();
  let offer: OfferVersion | null = offerDoc ? serializeOffer(offerDoc) : null;
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

  if (!offer) {
    throw new Error('Ponudba ni najdena.');
  }

  const overrides = await getOfferPdfOverride(offer._id?.toString?.() ?? offer._id);
  const fallbackCreatedAt = offer.createdAt ? new Date(offer.createdAt) : new Date();
  const numberingExample = formatOfferNumberExample(numberingConfig.pattern, new Date(), 1, numberingConfig.yearOverride);
  const fallbackNumber = formatOfferNumberExample(
    numberingConfig.pattern,
    fallbackCreatedAt,
    1,
    numberingConfig.yearOverride
  );
  const generatedNumber =
    overrides?.documentNumberOverride ?? offer.documentNumber ?? fallbackNumber;

  const offerWithTexts: OfferVersion = {
    ...offer,
    paymentTerms: overrides?.paymentTerms ?? offer.paymentTerms ?? documentSettings.defaultTexts.paymentTerms ?? '',
  };

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
  };
}
