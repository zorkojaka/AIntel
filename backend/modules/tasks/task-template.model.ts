import mongoose, { Document, Model, Schema } from 'mongoose';

import { TASK_PRIORITIES, type TaskPriority } from './task.model';

// Predloge opravil: podjetje v Nastavitve → Opravila definira svoje procese;
// v modulu Opravila se novo opravilo doda s klikom na predlogo (polja se
// predizpolnijo, a ostanejo uredljiva).

export interface TaskTemplateDocument extends Document {
  tenantId: string;
  name: string; // kratko ime na gumbu za hitri izbor
  title: string; // predizpolnjen naslov opravila
  description?: string;
  priority: TaskPriority;
  dueInDays?: number; // rok = danes + dueInDays; undefined = brez roka
  assigneeRole?: string; // '' / undefined = dodeli meni (ustvarjalcu)
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const TaskTemplateSchema = new Schema<TaskTemplateDocument>(
  {
    tenantId: { type: String, required: true, default: 'inteligent' },
    name: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    priority: { type: String, enum: TASK_PRIORITIES, required: true, default: 'normal' },
    dueInDays: { type: Number, min: 0, max: 365, default: undefined },
    assigneeRole: { type: String, trim: true, default: undefined },
    isActive: { type: Boolean, required: true, default: true },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'task_templates' },
);

TaskTemplateSchema.index({ tenantId: 1, order: 1 });

export const TaskTemplateModel: Model<TaskTemplateDocument> =
  mongoose.models.TaskTemplate || mongoose.model<TaskTemplateDocument>('TaskTemplate', TaskTemplateSchema);
