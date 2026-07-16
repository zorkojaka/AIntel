/** Dovolj za oster izpis na PDF; nad tem gre le se teza. */
export const NAJVECJA_STRANICA_PX = 1000;

/**
 * Nad to dolzino data URL raje prekodiramo v JPEG. Meja je postavljena krepko
 * pod 1 MB, ki jih prepusti nginx pred backendom — zahtevek nosi se ostale
 * nastavitve in po potrebi vec slik hkrati.
 */
export const NAJVECJA_DOLZINA_DATA_URL = 400_000;

/**
 * Ohrani razmerje stranic. Manjse slike pusti pri miru — povecevanje bi
 * kakovost samo poslabsalo.
 */
export function izracunajMere(
  sirina: number,
  visina: number,
  najvecjaStranica: number = NAJVECJA_STRANICA_PX,
): { sirina: number; visina: number } {
  if (!Number.isFinite(sirina) || !Number.isFinite(visina) || sirina <= 0 || visina <= 0) {
    return { sirina: 0, visina: 0 };
  }
  const najdaljsa = Math.max(sirina, visina);
  if (najdaljsa <= najvecjaStranica) {
    return { sirina: Math.round(sirina), visina: Math.round(visina) };
  }
  const faktor = najvecjaStranica / najdaljsa;
  return {
    sirina: Math.max(1, Math.round(sirina * faktor)),
    visina: Math.max(1, Math.round(visina * faktor)),
  };
}
