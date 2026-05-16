import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type ZahtevaStatus = 'osnutek' | 'koncana';
export type ZahtevaTipSistema = 'videonadzor' | 'alarm' | 'domofon' | 'pametna_hisa';

export interface ZahtevaDocument extends Document {
  projectId: Types.ObjectId;
  status: ZahtevaStatus;
  sistemi: Array<{
    id: string;
    tip: ZahtevaTipSistema;
    steviloLokacij: number;
    videonadzor?: {
      asortima: Array<{
        id: string;
        kameraProductId: Types.ObjectId;
        nosilecProductId?: Types.ObjectId | null;
      }>;
      lokacije: Array<{
        id: string;
        ime: string;
        asortimaIdAssigned?: string | null;
      }>;
      snemalnik: {
        productId?: Types.ObjectId | null;
      };
      poeSwitch: {
        productId?: Types.ObjectId | null;
      };
      disk: {
        productId?: Types.ObjectId | null;
        dniSnemanja: number;
        motionRecord: boolean;
      };
      dodatnaOprema: Array<{
        productId: Types.ObjectId;
        kolicina: number;
      }>;
      montaza: {
        vkljuceno: boolean;
        napeljava: boolean;
        metrov: number;
        zascitniMaterial?: 'kanal' | 'cev' | 'brez' | null;
      };
    };
    alarm?: Record<string, unknown>;
    domofon?: Record<string, unknown>;
    pametnaHisa?: Record<string, unknown>;
  }>;
  generatedQuoteId?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ObjectId = Schema.Types.ObjectId;

const VideonadzorSchema = new Schema(
  {
    asortima: {
      type: [
        new Schema(
          {
            id: { type: String, required: true, trim: true },
            kameraProductId: { type: ObjectId, ref: 'Product', required: true },
            nosilecProductId: { type: ObjectId, ref: 'Product', default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    lokacije: {
      type: [
        new Schema(
          {
            id: { type: String, required: true, trim: true },
            ime: { type: String, trim: true, default: '' },
            asortimaIdAssigned: { type: String, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    snemalnik: {
      productId: { type: ObjectId, ref: 'Product', default: null },
    },
    poeSwitch: {
      productId: { type: ObjectId, ref: 'Product', default: null },
    },
    disk: {
      productId: { type: ObjectId, ref: 'Product', default: null },
      dniSnemanja: { type: Number, default: 30, min: 7, max: 90 },
      motionRecord: { type: Boolean, default: false },
    },
    dodatnaOprema: {
      type: [
        new Schema(
          {
            productId: { type: ObjectId, ref: 'Product', required: true },
            kolicina: { type: Number, required: true, min: 1, default: 1 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    montaza: {
      vkljuceno: { type: Boolean, default: false },
      napeljava: { type: Boolean, default: false },
      metrov: { type: Number, default: 0, min: 0 },
      zascitniMaterial: { type: String, enum: ['kanal', 'cev', 'brez', null], default: null },
    },
  },
  { _id: false }
);

const SistemSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    tip: {
      type: String,
      enum: ['videonadzor', 'alarm', 'domofon', 'pametna_hisa'],
      required: true,
    },
    steviloLokacij: { type: Number, required: true, min: 0, default: 0 },
    videonadzor: { type: VideonadzorSchema, default: undefined },
    alarm: { type: Schema.Types.Mixed, default: undefined },
    domofon: { type: Schema.Types.Mixed, default: undefined },
    pametnaHisa: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
);

const ZahtevaSchema = new Schema<ZahtevaDocument>(
  {
    projectId: { type: ObjectId, ref: 'Project', required: true, index: true },
    status: {
      type: String,
      enum: ['osnutek', 'koncana'],
      required: true,
      default: 'osnutek',
    },
    sistemi: { type: [SistemSchema], default: [] },
    generatedQuoteId: { type: ObjectId, ref: 'OfferVersion', default: null },
    createdBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

ZahtevaSchema.index({ status: 1, updatedAt: -1 });

export const ZahtevaModel: Model<ZahtevaDocument> =
  (mongoose.models.Zahteva as Model<ZahtevaDocument>) ||
  (mongoose.model('Zahteva', ZahtevaSchema as any, 'zahteve') as Model<ZahtevaDocument>);
