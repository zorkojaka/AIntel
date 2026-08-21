import mongoose, { Document, Model, Schema } from 'mongoose';

export interface OfferBookingDocument extends Document {
  projectId: string;
  offerVersionId: mongoose.Types.ObjectId;
  candidateEmployeeIds: mongoose.Types.ObjectId[];
  bookingToken?: string;
  durationHours: number;
  scheduledAt?: string | null;
  selectedEmployeeId?: mongoose.Types.ObjectId | null;
  selectedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const OfferBookingSchema = new Schema<OfferBookingDocument>(
  {
    projectId: { type: String, required: true, index: true, trim: true },
    offerVersionId: { type: Schema.Types.ObjectId, required: true, ref: 'OfferVersion' },
    candidateEmployeeIds: { type: [Schema.Types.ObjectId], required: true, ref: 'Employee', default: [] },
    bookingToken: { type: String, default: undefined },
    durationHours: { type: Number, required: true, min: 1, default: 4 },
    scheduledAt: { type: String, default: null },
    selectedEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    selectedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

OfferBookingSchema.index({ projectId: 1, offerVersionId: 1 }, { unique: true });
OfferBookingSchema.index({ bookingToken: 1 }, { unique: true, sparse: true });

export const OfferBookingModel: Model<OfferBookingDocument> =
  (mongoose.models.OfferBooking as Model<OfferBookingDocument>) ||
  mongoose.model<OfferBookingDocument>('OfferBooking', OfferBookingSchema);
