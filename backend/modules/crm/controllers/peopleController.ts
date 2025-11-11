import { Request, Response } from 'express';
import { CrmPersonModel } from '../schemas/person';
import { CrmCompanyModel } from '../schemas/company';

export async function getPeople(_req: Request, res: Response) {
  try {
    const people = await CrmPersonModel.find().populate('company_id', 'name email phone').lean();
    res.success(people);
  } catch (error) {
    res.fail('Ne morem pridobiti kontaktov');
  }
}

export async function createPerson(req: Request, res: Response) {
  try {
    const payload = req.body;
    const person = await CrmPersonModel.create({
      first_name: payload.first_name,
      last_name: payload.last_name,
      email: payload.email,
      phone: payload.phone,
      company_id: payload.company_id,
      project_ids: payload.project_ids ?? [],
      notes: payload.notes ?? []
    });

    if (payload.company_id) {
      await CrmCompanyModel.findByIdAndUpdate(payload.company_id, {
        $addToSet: { persons: person._id }
      });
    }

    res.success(person);
  } catch (error) {
    res.fail('Ne morem ustvariti kontakta');
  }
}

export async function updatePerson(req: Request, res: Response) {
  try {
    const updated = await CrmPersonModel.findByIdAndUpdate(req.params.id, req.body, {
      new: true
    });
    if (!updated) {
      return res.fail('Kontakt ni najden', 404);
    }
    res.success(updated);
  } catch (error) {
    res.fail('Ne morem posodobiti kontakta');
  }
}

export async function deletePerson(req: Request, res: Response) {
  try {
    const deleted = await CrmPersonModel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.fail('Kontakt ni najden', 404);
    }

    if (deleted.company_id) {
      await CrmCompanyModel.findByIdAndUpdate(deleted.company_id, {
        $pull: { persons: deleted._id }
      });
    }

    res.success({ deleted: deleted._id });
  } catch (error) {
    res.fail('Ne morem izbrisati kontakta');
  }
}
