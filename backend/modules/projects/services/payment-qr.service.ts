import QRCode from 'qrcode';

import type { PaymentInfoContext } from './document-renderers';

export interface PaymentSeed {
  recipient: string;
  iban: string;
  amount: number;
  reference: string;
  purpose: string;
}

export async function buildPaymentInfo(seed: PaymentSeed): Promise<PaymentInfoContext> {
  const info: PaymentInfoContext = {
    recipient: seed.recipient,
    iban: seed.iban,
    amount: seed.amount,
    reference: seed.reference,
    purpose: seed.purpose,
    qrCodeDataUri: null,
    notice: null,
  };

  const hasData = seed.recipient && seed.iban && seed.amount > 0 && seed.reference;
  if (!hasData) {
    info.notice = 'QR ni na voljo (manjkajo podatki).';
    return info;
  }

  try {
    info.qrCodeDataUri = await QRCode.toDataURL(buildUpnQrPayload(seed), {
      errorCorrectionLevel: 'M',
      margin: 0,
    });
  } catch (error) {
    info.qrCodeDataUri = null;
    info.notice = 'QR ni na voljo (napaka pri generiranju).';
    console.error('Failed to generate QR code', error);
  }

  return info;
}

export function buildUpnQrPayload(seed: PaymentSeed) {
  return [
    'UPNQR',
    seed.recipient ?? '',
    seed.iban ?? '',
    (seed.amount ?? 0).toFixed(2),
    seed.reference ?? '',
    seed.purpose ?? '',
  ].join('\n');
}
