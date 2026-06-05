export const REOLINK_RLC_510A_IMAGE_URL =
  'https://home-cdn.reolink.us/wp-content/uploads/2025/07/290305431753758343.5763.jpg.webp';

function isReolinkRlc510AProduct(input: { ime?: unknown; proizvajalec?: unknown; isService?: unknown }) {
  if (input.isService === true) return false;
  if (typeof input.proizvajalec !== 'string' || input.proizvajalec.trim().toLowerCase() !== 'reolink') return false;
  return typeof input.ime === 'string' && /\brlc-?510a\b/i.test(input.ime);
}

export function applyReolinkImageOverride<T extends { ime?: unknown; proizvajalec?: unknown; isService?: unknown; povezavaDoSlike?: string; aaData?: any }>(
  product: T,
): T {
  if (!isReolinkRlc510AProduct(product)) {
    return product;
  }

  return {
    ...product,
    povezavaDoSlike: REOLINK_RLC_510A_IMAGE_URL,
    aaData: product.aaData
      ? {
          ...product.aaData,
          image: REOLINK_RLC_510A_IMAGE_URL,
        }
      : product.aaData,
  };
}
