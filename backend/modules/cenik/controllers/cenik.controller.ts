import { Request, Response } from 'express';
import { ProductDocument, ProductModel } from '../product.model';

type ProductPayload = Pick<
  ProductDocument,
  | 'ime'
  | 'kategorija'
  | 'nabavnaCena'
  | 'prodajnaCena'
  | 'kratekOpis'
  | 'dolgOpis'
  | 'povezavaDoSlike'
  | 'proizvajalec'
  | 'dobavitelj'
  | 'povezavaDoProdukta'
  | 'naslovDobavitelja'
  | 'casovnaNorma'
>;

const parsePrice = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

const castText = (value: unknown) => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
};

function buildPayload(body: Partial<ProductPayload>): ProductPayload {
  return {
    ime: castText(body.ime),
    kategorija: castText(body.kategorija),
    nabavnaCena: parsePrice(body.nabavnaCena),
    prodajnaCena: parsePrice(body.prodajnaCena),
    kratekOpis: castText(body.kratekOpis),
    dolgOpis: castText(body.dolgOpis),
    povezavaDoSlike: castText(body.povezavaDoSlike),
    proizvajalec: castText(body.proizvajalec),
    dobavitelj: castText(body.dobavitelj),
    povezavaDoProdukta: castText(body.povezavaDoProdukta),
    naslovDobavitelja: castText(body.naslovDobavitelja),
    casovnaNorma: castText(body.casovnaNorma)
  };
}

export async function getAllProducts(_req: Request, res: Response) {
  try {
    const products = await ProductModel.find().lean();
    res.success(products);
  } catch (error) {
    res.fail('Ne morem pridobiti cenika');
  }
}

export async function getProductById(req: Request, res: Response) {
  try {
    const product = await ProductModel.findById(req.params.id).lean();
    if (!product) {
      return res.fail('Produkt ne obstaja', 404);
    }
    res.success(product);
  } catch (error) {
    res.fail('Napaka pri iskanju produkta');
  }
}

export async function createProduct(req: Request, res: Response) {
  try {
    const payload = buildPayload(req.body);
    if (!payload.ime || !payload.kategorija) {
      return res.fail('Ime in kategorija sta obvezni', 400);
    }
    const created = await ProductModel.create(payload);
    res.success(created, 201);
  } catch (error) {
    res.fail('Napaka pri dodajanju produkta');
  }
}

export async function updateProduct(req: Request, res: Response) {
  try {
    const payload = buildPayload(req.body);
    const updated = await ProductModel.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!updated) {
      return res.fail('Produkt ne obstaja', 404);
    }
    res.success(updated);
  } catch (error) {
    res.fail('Napaka pri posodabljanju produkta');
  }
}

export async function deleteProduct(req: Request, res: Response) {
  try {
    const deleted = await ProductModel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.fail('Produkt ne obstaja', 404);
    }
    res.success({ message: 'Produkt izbrisan' });
  } catch (error) {
    res.fail('Napaka pri brisanju produkta');
  }
}
