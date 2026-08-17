import mongoose, { Document, Model, Schema } from 'mongoose';

export interface BookingPreviewDocument extends Document {
  employeeIds: mongoose.Types.ObjectId[];
  bookingToken: string;
  durationHours: number;
  label: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BookingPreviewSchema = new Schema<BookingPreviewDocument>(
  {
    employeeIds: { type: [Schema.Types.ObjectId], required: true, ref: 'Employee', default: [] },
    bookingToken: { type: String, required: true },
    durationHours: { type: Number, required: true, min: 1, max: 8, default: 1 },
    label: { type: String, required: true, trim: true, default: 'Predogled prostih terminov' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

BookingPreviewSchema.index({ bookingToken: 1 }, { unique: true });
BookingPreviewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BookingPreviewModel: Model<BookingPreviewDocument> =
  (mongoose.models.BookingPreview as Model<BookingPreviewDocument>) ||
  mongoose.model<BookingPreviewDocument>('BookingPreview', BookingPreviewSchema);
