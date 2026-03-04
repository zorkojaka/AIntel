import { Request, Response } from 'express';
import { CrmCompanyModel } from '../schemas/company';
import { CrmNoteModel } from '../schemas/note';

export async function getCompanies(_req: Request, res: Response) {
  try {
    const companies = await CrmCompanyModel.find().lean();
    res.success(companies);
  } catch (error) {
    res.fail('Ne morem pridobiti podjetij');
  }
}

export async function createCompany(req: Request, res: Response) {
  try {
    const company = await CrmCompanyModel.create({
      name: req.body.name,
      vat_id: req.body.vat_id,
      address: req.body.address,
      phone: req.body.phone,
      email: req.body.email,
      notes: req.body.notes ?? []
    });
    res.success(company);
  } catch (error) {
    res.fail('Ne morem dodati podjetja');
  }
}

export async function getCompanyDetails(req: Request, res: Response) {
  try {
    const company = await CrmCompanyModel.findById(req.params.id)
      .populate('persons', 'first_name last_name email phone')
      .lean();

    if (!company) {
      return res.fail('Podjetje ni najdeno', 404);
    }

    const notes = await CrmNoteModel.find({
      entity_type: 'company',
      entity_id: company._id
    })
      .sort({ created_at: -1 })
      .lean();

    res.success({ ...company, people: company.persons, notes });
  } catch (error) {
    res.fail('Ne morem pridobiti podatkov podjetja');
  }
}
