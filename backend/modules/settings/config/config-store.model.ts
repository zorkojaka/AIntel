// AIN-P2-11: config store — enotna, tenant-scoped shramba za nastavitve po
// imenskih prostorih (`config.<modul>.<kljuc>`). Ena vrstica na (tenantId, namespace);
// `value` je cel objekt imenskega prostora, validiran prek registrirane sheme.
import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ConfigStoreDocument extends Document {
  tenantId: string;
  namespace: string;
  value: Record<string, unknown>;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ConfigStoreSchema = new Schema<ConfigStoreDocument>(
  {
    tenantId: { type: String, required: true, index: true, default: 'inteligent' },
    namespace: { type: String, required: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true, default: {} },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true, versionKey: false, collection: 'config_store' },
);

// Ena konfiguracija na imenski prostor znotraj tenanta.
ConfigStoreSchema.index({ tenantId: 1, namespace: 1 }, { unique: true });

export const ConfigStoreModel: Model<ConfigStoreDocument> =
  (mongoose.models.ConfigStore as Model<ConfigStoreDocument>) ||
  mongoose.model<ConfigStoreDocument>('ConfigStore', ConfigStoreSchema);
