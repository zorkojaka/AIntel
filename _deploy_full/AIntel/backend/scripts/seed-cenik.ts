import path from 'node:path';
import fs from 'node:fs';

import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { ProductModel } from '../modules/cenik/product.model';
import { loadEnvironment } from '../loadEnv';

type CsvRow = Record<string, string>;

const CSV_PATH = path.resolve(__dirname, '..', '..', 'Cenik___Pripravljena_Struktura.csv');

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((column) => column.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(',').map((value) => value.trim());
    return header.reduce<CsvRow>((row, column, index) => {
      row[column] = values[index] ?? '';
      return row;
    }, {});
  });
}

function parseNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

function buildProduct(row: CsvRow) {
  return {
    ime: row['Ime produkta'] ?? '',
    kategorija: row['Kategorija'] || 'drugo',
    nabavnaCena: parseNumber(row['Nabavna cena']),
    prodajnaCena: parseNumber(row['Prodajna cena']),
    kratekOpis: row['Kratek opis'] ?? '',
    dolgOpis: row['Dolg opis'] ?? '',
    povezavaDoSlike: row['Povezava do slike'] ?? '',
    proizvajalec: row['Proizvajalec'] ?? '',
    dobavitelj: row['Dobavitelj'] ?? '',
    povezavaDoProdukta: row['Povezava do produkta'] ?? '',
    naslovDobavitelja: row['Naslov dobavitelja'] ?? '',
    casovnaNorma: row['Casovna norma - storitve'] ?? ''
  };
}

async function seed() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const parsed = parseCsv(raw);

  if (parsed.length === 0) {
    console.log('CSV nima podatkov, ni kaj uvozit.');
    return;
  }

  loadEnvironment();
  await connectToMongo();

  let created = 0;
  for (const row of parsed) {
    const product = buildProduct(row);
    if (!product.ime) continue;
    await ProductModel.updateOne({ ime: product.ime }, { $set: product }, { upsert: true });
    created += 1;
  }

  console.log(`Cenik: uvoženo ${created} produktov oziroma posodobljeno.`);
}

seed()
  .catch((error) => {
    console.error('Napaka pri uvozu cenika:', error);
  })
  .finally(() => {
    mongoose.connection.close();
  });
