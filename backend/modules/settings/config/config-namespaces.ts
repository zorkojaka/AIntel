// AIN-P2-11: registracija imenskih prostorov config store. Tu se prostori "posvajajo"
// postopoma (MODULARIZATION_PLAN §Configuration): web-inquiry, pdf, sender, category
// nastavitve, pragovi izvedbenih pravil, prag pregleda, popustni pasovi, besedilo ogleda.
// Zaenkrat registriramo semenske prostore z varnimi privzetimi vrednostmi + admin API;
// obstoječe žive kolekcije (na SKUPNI staging+prod bazi) se selijo posamično, ker je
// vsaka selitev lastniško vodena. Consumerji preidejo na `getConfig()` inkrementalno.
import { registerConfigNamespace } from './config-registry';
import { v } from './config-validator';

let registered = false;

export function registerCoreConfigNamespaces(): void {
  if (registered) return;
  registered = true;

  // Splošne platforme (semenski prostor). Prazni privzetki = nespremenjeno vedenje.
  registerConfigNamespace({
    namespace: 'platform.general',
    description: 'Splošne nastavitve platforme.',
    schema: v.object({
      // Besedilo ob strokovnem ogledu (npr. na rezultatu konfiguratorja / v mailu).
      siteVisitFeeText: v
        .string({ max: 300 })
        .default('Strokovni ogled objekta (50 € z DDV; ob izvedbi se prizna kot popust).'),
      // Informativna opomba o roku izvedbe.
      executionLeadText: v.string({ max: 300 }).default('praviloma v 14 dneh po potrditvi in plačilu avansa'),
    }),
  });

  // Prepoznava bančnih obvestil o prilivu v dohodni pošti (payment.bank_email).
  // senders: podnizi pošiljateljevega naslova (npr. "nlb.si") — prazno = neaktivno.
  registerConfigNamespace({
    namespace: 'finance.bank',
    description: 'Prepoznava bančnih obvestil o prilivu za samodejno ujemanje plačil računov.',
    schema: v.object({
      senders: v.array(v.string({ max: 120 }), { max: 20 }).default([]),
      // Vsaj ena od teh besed mora biti v zadevi ali telesu, da mail štejemo za obvestilo o prilivu.
      keywords: v
        .array(v.string({ max: 60 }), { max: 20 })
        .default(['priliv', 'nakazil', 'prejeli', 'dobro pisan', 'knjižen']),
    }),
  });

  // Popustni pasovi (prag pregleda / količinski popusti) — semenski prostor.
  registerConfigNamespace({
    namespace: 'sales.discounts',
    description: 'Količinski popustni pasovi (prag → odstotek) in prag ročnega pregleda ponudbe.',
    schema: v.object({
      // Nad tem zneskom (z DDV) gre ponudba v ročni pregled (0 = brez praga).
      manualReviewThreshold: v.number({ min: 0 }).default(0),
      bands: v
        .array(
          v.object({
            minQuantity: v.number({ min: 1, int: true }),
            percent: v.number({ min: 0, max: 100 }),
          }),
          { max: 20 },
        )
        .default([]),
    }),
  });
}
