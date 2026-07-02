/*
 * Read-only pre-flight za modul spletnih povpraševanj.
 * Preveri, ali ima sistem vse, kar avtomatska pot potrebuje. Ničesar ne zapisuje.
 * Zagon: ts-node --transpile-only scripts/web-inquiries-preflight.ts
 */
import mongoose from 'mongoose';
import { loadEnvironment } from '../loadEnv';
import { ProductModel } from '../modules/cenik/product.model';
import { predlagajDisk, predlagajPoESwitch, predlagajSnemalnik } from '../modules/zahteve/zahteva.service';
import { WebInquirySettingsModel } from '../modules/web-inquiries/web-inquiry-settings.model';

async function main() {
  loadEnvironment();
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB;
  if (!uri) throw new Error('MONGO_URI ni nastavljen.');
  await mongoose.connect(uri, { dbName });
  console.log(`✔ Povezan na bazo "${dbName}"`);

  const report: string[] = [];

  const settings = await WebInquirySettingsModel.findOne({ tenantId: 'inteligent' }).lean();
  report.push(settings ? `✔ Nastavitve vtičnika obstajajo (enabled=${settings.enabled})` : '✖ Nastavitve vtičnika še ne obstajajo (nastale bodo ob prvem obisku nastavitev).');

  const cameraCount = await ProductModel.countDocuments({ 'classification.productType': 'kamera', isActive: true });
  report.push(cameraCount > 0 ? `✔ Kamere v ceniku: ${cameraCount}` : '✖ V ceniku ni aktivnih kamer (classification.productType=kamera).');

  const snemalnik = await predlagajSnemalnik(4, undefined, true);
  report.push(snemalnik ? `✔ Predlog snemalnika za 4 kamere: ${snemalnik.ime}` : '✖ Sistem ne najde snemalnika s PoE za 4 kamere.');

  const poeSwitch = await predlagajPoESwitch(4);
  report.push(poeSwitch ? `✔ Predlog PoE switcha: ${poeSwitch.ime}` : '⚠ PoE switch ni najden (v redu, če imajo snemalniki PoE).');

  const disk = await predlagajDisk(2, true);
  report.push(disk ? `✔ Predlog diska (2TB): ${disk.ime}` : '✖ Nadzorni disk ni najden v ceniku.');

  const senderSettings = await mongoose.connection.db!.collection('communication_sender_settings').findOne({});
  report.push(senderSettings?.enabled
    ? `✔ Email pošiljatelj: ${senderSettings.senderName} <${senderSettings.senderEmail}>`
    : '✖ Email komunikacija ni omogočena (Nastavitve → Komunikacija).');

  const offerTemplate = await mongoose.connection.db!.collection('communication_templates').findOne({ category: 'offer_send' });
  report.push(offerTemplate
    ? `✔ Email predloga za pošiljanje ponudbe: "${offerTemplate.name ?? offerTemplate.key ?? offerTemplate._id}"`
    : '✖ Ni email predloge s kategorijo offer_send.');

  report.push(process.env.ORS_API_KEY?.trim()
    ? '✔ ORS_API_KEY je nastavljen (samodejna kilometrina deluje).'
    : '⚠ ORS_API_KEY ni nastavljen – kilometrina bo 0, v ponudbi označeno za ročni pregled.');

  report.push(process.env.AINTEL_WEB_INQUIRY_API_KEY?.trim()
    ? '✔ AINTEL_WEB_INQUIRY_API_KEY je nastavljen.'
    : '✖ AINTEL_WEB_INQUIRY_API_KEY ni nastavljen – javni endpoint vrača 503.');

  console.log('\n=== PRE-FLIGHT POROČILO ===');
  report.forEach((line) => console.log(line));

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Pre-flight neuspešen:', error);
  process.exit(1);
});
