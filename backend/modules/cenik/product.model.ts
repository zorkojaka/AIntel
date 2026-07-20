import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ProductDocument extends Document {
  externalSource?: string;
  externalId?: string;
  externalKey?: string;
  ime: string;
  kategorija?: string;
  categorySlugs: string[];
  categorySlug?: string;
  categories?: string[];
  purchasePriceWithoutVat: number;
  nabavnaCena: number;
  prodajnaCena: number;
  kratekOpis?: string;
  dolgOpis?: string;
  povezavaDoSlike?: string;
  proizvajalec?: string;
  dobavitelj?: string;
  povezavaDoProdukta?: string;
  naslovDobavitelja?: string;
  casovnaNorma?: string;
  isService: boolean;
  defaultExecutionMode?: 'simple' | 'per_unit' | 'measured';
  defaultInstructionsTemplate?: string;
  isActive?: boolean;
  aaData?: {
    productCode?: string;
    image?: string;
    category?: string;
    attributes?: Array<{ attribute: string; term: string }>;
    rawDescription?: string;
    stock?: string;
    vat?: number;
    lastSyncedAt?: Date;
  };
  classification?: {
    productType?: 'kamera' | 'snemalnik' | 'switch' | 'disk' | 'nosilec' | 'kabel' | 'pribor' | 'storitev' | 'alarm_komponenta' | 'drugo';
    manufacturer?: string;
    cameraConnectivity?: 'wifi' | 'poe' | 'lte';
    powerMode?: 'dc' | 'poe' | 'battery';
    hasSim?: boolean;
    supportsSolarPanel?: boolean;
    cameraHousing?: 'Bullet' | 'Turret' | 'Dome' | 'PTZ' | 'Panoramic' | 'Fisheye' | 'Thermal';
    cameraTechnology?: 'IP video' | 'AHD' | 'Analog';
    maxResolutionMP?: number;
    hasPoE?: boolean;
    lensType?: 'fixed' | 'varifocal' | 'motor';
    lensFocalLength?: string;
    irRangeM?: number;
    nvrChannels?: number;
    nvrHasPoE?: boolean;
    nvrHddSlots?: number;
    nvrMaxResolutionMP?: number;
    poePortCount?: number;
    switchSpeed?: 'megabit' | 'gigabit';
    diskCapacityTB?: number;
    isSurveillanceDisk?: boolean;
    compatibleBracketCodes?: string[];
    bracketCodeOwn?: string;
    confidence?: 'high' | 'medium' | 'low';
    needsReview?: boolean;
  };
  mergedIntoProductId?: mongoose.Types.ObjectId;
  status?: 'active' | 'merged';
  // ECO-33: owner-managed display curation. Never written by import syncs.
  merchandising?: {
    published?: boolean;
    featured?: boolean;
    vrstniRed?: number;
    oznaka?: string;
  };
  // ECO-35: derived sales statistics from accepted offer versions.
  // Recomputed by scripts/compute-sales-stats.ts; never synced from imports.
  salesStats?: {
    soldQty?: number;
    soldQty365?: number;
    offersCount?: number;
    salesRank?: number;
    boughtWith?: Array<{ productId: string; ime: string; count: number }>;
    computedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<ProductDocument>(
  {
    externalSource: { type: String, trim: true, default: '' },
    externalId: { type: String, trim: true, default: '' },
    externalKey: { type: String, trim: true, unique: true, sparse: true },
    ime: { type: String, required: true, trim: true },
    kategorija: { type: String, trim: true, default: '' },
    categorySlugs: { type: [String], default: [] },
    categorySlug: { type: String, trim: true, lowercase: true },
    categories: { type: [String], default: [] },
    purchasePriceWithoutVat: { type: Number, required: true, min: 0, default: 0 },
    nabavnaCena: { type: Number, required: true, min: 0, default: 0 },
    prodajnaCena: { type: Number, required: true, min: 0, default: 0 },
    kratekOpis: { type: String, trim: true, default: '' },
    dolgOpis: { type: String, trim: true, default: '' },
    povezavaDoSlike: { type: String, trim: true, default: '' },
    proizvajalec: { type: String, trim: true, default: '' },
    dobavitelj: { type: String, trim: true, default: '' },
    povezavaDoProdukta: { type: String, trim: true, default: '' },
    naslovDobavitelja: { type: String, trim: true, default: '' },
    casovnaNorma: { type: String, trim: true, default: '' },
    isService: { type: Boolean, default: false },
    defaultExecutionMode: {
      type: String,
      enum: ['simple', 'per_unit', 'measured'],
      default: undefined,
    },
    defaultInstructionsTemplate: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
    aaData: {
      type: {
        productCode: { type: String, trim: true, default: '' },
        image: { type: String, trim: true, default: '' },
        category: { type: String, trim: true, default: '' },
        attributes: [
          {
            attribute: { type: String, required: true, trim: true },
            term: { type: String, required: true, trim: true },
          },
        ],
        rawDescription: { type: String, default: '' },
        stock: { type: String, trim: true, default: '' },
        vat: { type: Number, default: undefined },
        lastSyncedAt: { type: Date, default: Date.now },
      },
      required: false,
      default: undefined,
    },
    classification: {
      type: {
        productType: {
          type: String,
          enum: ['kamera', 'snemalnik', 'switch', 'disk', 'nosilec', 'kabel', 'pribor', 'storitev', 'alarm_komponenta', 'drugo'],
        },
        manufacturer: { type: String, trim: true, default: '' },
        cameraConnectivity: { type: String, enum: ['wifi', 'poe', 'lte'], default: undefined },
        powerMode: { type: String, enum: ['dc', 'poe', 'battery'], default: undefined },
        hasSim: { type: Boolean, default: undefined },
        supportsSolarPanel: { type: Boolean, default: undefined },
        cameraHousing: {
          type: String,
          enum: ['Bullet', 'Turret', 'Dome', 'PTZ', 'Panoramic', 'Fisheye', 'Thermal'],
        },
        cameraTechnology: { type: String, enum: ['IP video', 'AHD', 'Analog'] },
        maxResolutionMP: { type: Number, default: undefined },
        hasPoE: { type: Boolean, default: undefined },
        lensType: { type: String, enum: ['fixed', 'varifocal', 'motor'] },
        lensFocalLength: { type: String, trim: true, default: '' },
        irRangeM: { type: Number, default: undefined },
        nvrChannels: { type: Number, default: undefined },
        nvrHasPoE: { type: Boolean, default: undefined },
        nvrHddSlots: { type: Number, default: undefined },
        nvrMaxResolutionMP: { type: Number, default: undefined },
        poePortCount: { type: Number, default: undefined },
        switchSpeed: { type: String, enum: ['megabit', 'gigabit'] },
        diskCapacityTB: { type: Number, default: undefined },
        isSurveillanceDisk: { type: Boolean, default: undefined },
        compatibleBracketCodes: [{ type: String, trim: true }],
        bracketCodeOwn: { type: String, trim: true, default: '' },
        confidence: { type: String, enum: ['high', 'medium', 'low'] },
        needsReview: { type: Boolean, default: false },
      },
      required: false,
      default: undefined,
    },
    mergedIntoProductId: { type: Schema.Types.ObjectId, ref: 'Product', default: undefined },
    status: { type: String, enum: ['active', 'merged'], default: 'active' },
    merchandising: {
      type: {
        published: { type: Boolean, default: true },
        featured: { type: Boolean, default: false },
        vrstniRed: { type: Number, default: undefined },
        oznaka: { type: String, trim: true, default: '' }
      },
      required: false,
      default: undefined,
      _id: false
    },
    salesStats: {
      type: {
        soldQty: { type: Number, default: 0 },
        soldQty365: { type: Number, default: 0 },
        offersCount: { type: Number, default: 0 },
        salesRank: { type: Number, default: undefined },
        boughtWith: {
          type: [
            {
              productId: { type: String, required: true },
              ime: { type: String, trim: true, default: '' },
              count: { type: Number, default: 0 },
              _id: false
            }
          ],
          default: []
        },
        computedAt: { type: Date, default: undefined }
      },
      required: false,
      default: undefined,
      _id: false
    }
  },
  {
    timestamps: true
  }
);

ProductSchema.index({ externalSource: 1, 'classification.productType': 1 });
ProductSchema.index({ 'classification.manufacturer': 1, 'classification.cameraHousing': 1 });
ProductSchema.index({ 'classification.maxResolutionMP': 1 });
ProductSchema.index(
  { externalSource: 1, externalId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalSource: 'aa_api',
      // partial indexes ne podpirajo $ne; $gt: '' zajame vse neprazne nize
      externalId: { $type: 'string', $gt: '' }
    }
  }
);

export const ProductModel: Model<ProductDocument> =
  (mongoose.models.Product as Model<ProductDocument>) || mongoose.model<ProductDocument>('Product', ProductSchema);
