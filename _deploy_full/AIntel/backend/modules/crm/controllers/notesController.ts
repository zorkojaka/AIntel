import { Request, Response } from 'express';
import { CrmNoteModel } from '../schemas/note';

export async function getNotesByEntity(req: Request, res: Response) {
  const { entityType, entityId } = req.params;
  try {
    if (!['person', 'company'].includes(entityType)) {
      return res.fail('Neveljaven tip entitete', 400);
    }
    const notes = await CrmNoteModel.find({
      entity_type: entityType,
      entity_id: entityId
    })
      .sort({ created_at: -1 })
      .lean();
    res.success(notes);
  } catch (error) {
    res.fail('Ne morem pridobiti opomb');
  }
}
