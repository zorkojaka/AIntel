/**
 * Slike (logotip, podpis, zig) se hranijo kot data URL v nastavitvah in se
 * vlagajo v vsak PDF. Fotografija s telefona bi zahtevek napihnila cez mejo
 * telesa (413) in po nepotrebnem obtezila vsak dokument, zato jo pred
 * shranjevanjem pomanjsamo.
 *
 * Racun mer zivi v shared/utils/image-size, da ga lahko pokrijemo s testi.
 */
import {
  izracunajMere,
  NAJVECJA_DOLZINA_DATA_URL,
  NAJVECJA_STRANICA_PX,
} from '../../../../shared/utils/image-size';

export { izracunajMere, NAJVECJA_DOLZINA_DATA_URL, NAJVECJA_STRANICA_PX };

function preberiKotDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Datoteke ni mogoče prebrati.'));
    reader.readAsDataURL(file);
  });
}

function nalozi(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Slike ni mogoče prebrati.'));
    image.src = dataUrl;
  });
}

/**
 * Prebere sliko in jo po potrebi pomanjsa.
 *
 * Najprej poskusi PNG, ker podpis in zig pogosto stojita na prosojnem ozadju,
 * ki bi ga JPEG pocrnil. PNG fotografije (skeniran podpis) pa zna ostati velik,
 * zato v tem primeru raje JPEG — nginx pred backendom prepusti 1 MB.
 */
export async function preberiInPomanjsaj(
  file: File,
  najvecjaStranica: number = NAJVECJA_STRANICA_PX,
): Promise<string> {
  const izvirnik = await preberiKotDataUrl(file);
  try {
    const image = await nalozi(izvirnik);
    const mere = izracunajMere(image.naturalWidth, image.naturalHeight, najvecjaStranica);
    if (mere.sirina === 0) return izvirnik;

    const canvas = document.createElement('canvas');
    canvas.width = mere.sirina;
    canvas.height = mere.visina;
    const ctx = canvas.getContext('2d');
    if (!ctx) return izvirnik;
    ctx.drawImage(image, 0, 0, mere.sirina, mere.visina);

    const png = canvas.toDataURL('image/png');
    if (png.length <= NAJVECJA_DOLZINA_DATA_URL) {
      return jeManjsi(png, izvirnik, mere, image) ? png : izvirnik;
    }
    const jpeg = canvas.toDataURL('image/jpeg', 0.85);
    return jpeg.length < png.length ? jpeg : png;
  } catch {
    // Kadar pomanjsanje ne uspe (npr. SVG brez mer), raje shranimo izvirnik,
    // kot da bi uporabniku vzeli moznost nalaganja.
    return izvirnik;
  }
}

/**
 * Ce slike sploh nismo pomanjsali, je izvirnik pogosto ze optimalen (npr.
 * stisnjen PNG logotip), nase risanje na canvas pa bi ga lahko samo napihnilo.
 */
function jeManjsi(
  png: string,
  izvirnik: string,
  mere: { sirina: number; visina: number },
  image: HTMLImageElement,
) {
  const nespremenjenaVelikost = mere.sirina === image.naturalWidth && mere.visina === image.naturalHeight;
  if (!nespremenjenaVelikost) return true;
  return png.length < izvirnik.length;
}
