import mongoose, { Document, Model, Schema } from 'mongoose';

export interface UserDocument extends Document {
  tenantId: string;
  email: string;
  name: string;
  roles: string[];
  status?: 'INVITED' | 'ACTIVE' | 'DISABLED';
  passwordHash?: string | null;
  inviteTokenHash?: string | null;
  inviteTokenExpiresAt?: Date | null;
  resetTokenHash?: string | null;
  resetTokenExpiresAt?: Date | null;
  active: boolean;
  employeeId?: mongoose.Types.ObjectId | null;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDocument>(
  {
    tenantId: { type: String, required: true, index: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, trim: true, default: '' },
    roles: { type: [String], default: [] },
    status: { type: String, enum: ['INVITED', 'ACTIVE', 'DISABLED'], default: 'ACTIVE' },
    passwordHash: { type: String, default: null },
    inviteTokenHash: { type: String, default: null },
    inviteTokenExpiresAt: { type: Date, default: null },
    resetTokenHash: { type: String, default: null },
    resetTokenExpiresAt: { type: Date, default: null },
    active: { type: Boolean, required: true, default: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true }
);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const UserModel: Model<UserDocument> =
  (mongoose.models.User as Model<UserDocument>) || mongoose.model<UserDocument>('User', UserSchema);
