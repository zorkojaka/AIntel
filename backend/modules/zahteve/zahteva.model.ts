import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type ZahtevaStatus = 'osnutek' | 'v_obdelavi' | 'koncana' | 'preskoceno';
export type ZahtevaTipProjekta = 'videonadzor' | 'alarm' | 'domofon' | 'pametna_hisa';
export type ZahtevaPot = 'ogled' | 'paket' | 'preskoceno';

export interface ZahtevaDocument extends Document {
  projectId: Types.ObjectId;
  status: ZahtevaStatus;
  tipProjekta: ZahtevaTipProjekta;
  pot: ZahtevaPot;
  videonadzor: {
    lokacije: Array<{
      id: string;
      ime: string;
      opis?: string;
      kameraId?: string | null;
    }>;
    kosarica: Array<{
      id: string;
      kameraProductId: Types.ObjectId;
      nosilecProductId?: Types.ObjectId | null;
    }>;
    snemalnik: {
      productId?: Types.ObjectId | null;
      kanali: number;
      hasPoE: boolean;
    };
    poeSwitch: {
      productId?: Types.ObjectId | null;
      portov: number;
    };
    disk: {
      productId?: Types.ObjectId | null;
      kapaciteta: number;
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
  alarm: Record<string, unknown>;
  domofon: Record<string, unknown>;
  pametnaHisa: Record<string, unknown>;
  generatedQuoteId?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ObjectId = Schema.Types.ObjectId;

const VideonadzorSchema = new Schema(
  {
    lokacije: {
      type: [
        new Schema(
          {
            id: { type: String, required: true, trim: true },
            ime: { type: String, trim: true, default: '' },
            opis: { type: String, trim: true, default: '' },
            kameraId: { type: String, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    kosarica: {
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
    snemalnik: {
      productId: { type: ObjectId, ref: 'Product', default: null },
      kanali: { type: Number, default: 0 },
      hasPoE: { type: Boolean, default: false },
    },
    poeSwitch: {
      productId: { type: ObjectId, ref: 'Product', default: null },
      portov: { type: Number, default: 0 },
    },
    disk: {
      productId: { type: ObjectId, ref: 'Product', default: null },
      kapaciteta: { type: Number, default: 0 },
      dniSnemanja: { type: Number, default: 30 },
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

const ZahtevaSchema = new Schema<ZahtevaDocument>(
  {
    projectId: { type: ObjectId, ref: 'Project', required: true, index: true },
    status: {
      type: String,
      enum: ['osnutek', 'v_obdelavi', 'koncana', 'preskoceno'],
      required: true,
      default: 'osnutek',
    },
    tipProjekta: {
      type: String,
      enum: ['videonadzor', 'alarm', 'domofon', 'pametna_hisa'],
      required: true,
    },
    pot: {
      type: String,
      enum: ['ogled', 'paket', 'preskoceno'],
      required: true,
    },
    videonadzor: { type: VideonadzorSchema, default: () => ({}) },
    alarm: { type: Schema.Types.Mixed, default: {} },
    domofon: { type: Schema.Types.Mixed, default: {} },
    pametnaHisa: { type: Schema.Types.Mixed, default: {} },
    generatedQuoteId: { type: ObjectId, ref: 'OfferVersion', default: null },
    createdBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

ZahtevaSchema.index({ status: 1, createdAt: -1 });
ZahtevaSchema.index({ tipProjekta: 1, status: 1 });

export const ZahtevaModel: Model<ZahtevaDocument> =
  (mongoose.models.Zahteva as Model<ZahtevaDocument>) ||
  (mongoose.model('Zahteva', ZahtevaSchema as any, 'zahteve') as Model<ZahtevaDocument>);
