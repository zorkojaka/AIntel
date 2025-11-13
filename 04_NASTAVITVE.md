FAZA 4: NASTAVITVE
🎯 Namen

Ustvariti centralni sistem nastavitev (Settings), ki omogoča enotno prilagoditev poslovnih podatkov, oblikovanja dokumentov in sistemskih parametrov. Vse spremembe se avtomatsko uporabljajo v modulih (PDF-ji, UI barve, kontaktni podatki).

✅ Kaj s tem dosežemo

Centralizacija: nastavitve na enem mestu.

Prilagodljivost: uporabniki lahko prilagajajo izgled in poslovne podatke.

Povezljivost: vsi moduli (CRM, Projekti, Cenik, PDF) črpajo te podatke.

🧱 Arhitektura
Backend

Lokacija: backend/modules/settings

Model: Settings.ts

Endpointi:

GET /settings → vrne trenutne nastavitve

PUT /settings → posodobi nastavitve

interface Settings {
  companyName: string;
  address: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  primaryColor?: string;
  documentPrefix?: {
    offer: string;
    invoice: string;
    order: string;
    deliveryNote: string;
    workOrder: string;
  };
  defaultPaymentTerms?: string;
  disclaimer?: string;
}

V MongoDB naj bo vedno prisoten samo en Settings dokument. Če ne obstaja, ga inicializiraj (seed).

Dodaš helper getSettings() za globalni dostop iz drugih modulov (PDF, CRM, Projekti).

Frontend

Lokacija: apps/module-settings

Route: /nastavitve

Struktura:

Osnovni podatki podjetja

Logotip (upload + preview)

Barve in dizajn

Prefixi dokumentov (ponudba, račun, naročilnica ...)

Predogled izpisa PDF (gumb za test)

Uporabi @packages/ui komponente:

Input, Textarea, Card, Button, ColorPicker, FileUpload, DataTable

Komunikacija z backend prek GET /settings, PUT /settings

🧪 Testiranje

Odpri /nastavitve in spremeni kontaktni podatek.

Shrani in preveri:

Se podatki pravilno pošljejo prek PUT /settings?

Se sprememba takoj odraža v PDF predogledu?

Osveži stran → podatki se morajo znova naložiti.

🧠 Integracija z drugimi moduli

PDF rendering naj pri izpisu povleče:

companyName, address, logoUrl, disclaimer

Prefix dokumenta glede na tip (offer, invoice ...)

Modul Projekti / CRM:

Kontakt podjetja (naslov, e-pošta) na vidnem mestu

Modul Cenik:

Default valuta ali davčna stopnja (če dodamo v nastavitve)

🛠️ TODO naloge za agenta




📁 Dodatno

Seed datoteka naj bo v backend/seeds/settings.json

Določi default barve, disclaimer, logo (lahko prazno)

PDF preview lahko uporablja dummy projekt + nastavitve za prikaz

ℹ️ Opombe

Podatki so v slovenščini → UTF-8 + pravilna obravnava šumnikov.

Ta modul ne sme imeti odvisnosti do drugih modulov (izvoz je Settings kot shared context).

Agent naj označi napredek v docs/TODO.md in fazni dokument docs/faze/05-NASTAVITVE.md.## Zacetni prompt za agenta (FAZA 4 – Nastavitve)

> Deluj kot senior razvijalec: najprej razumem okolje, nato delam spremembe. Tako se izognemo zapletom iz faze 3 (napačni `.env`, 404 na `/api`, pozabljena dokumentacija).

1. **Onboarding** – preberi `README.md`, `00_CORE.md`, `docs/ARHITEKTURA.md`, `docs/TODO.md`, `docs/MODULES.md`, `docs/KOORDINACIJA.md`, `docs/faze/03-CENIK.md`, `docs/faze/04-NASTAVITVE.md` in `MOJA-NAVODILA.md`. V `docs/KOORDINACIJA.md` odpri sekcijo “Agent <ime> – Nastavitve” šele po tem koraku.
2. **Okolje / `.env`** – backend in skripte uporabljajo `backend/loadEnv.ts`, zato mora ROOT `.env` vsebovati pravilne vrednosti (`MONGO_URI`, `PORT`, ...). Ne ustvarjaj novih `.env` v `backend/`. Skripte (seed) vedno kliči preko `pnpm --filter aintel-backend <skripta>` – to avtomatsko naloži root `.env`.
3. **Zagon** – `pnpm install` v rootu, nato `pnpm run dev:stack` za celoten sklad. Če želiš seedati podatke, imamo že `pnpm --filter aintel-backend seed:cenik`; za fazo 4 dodaj `seed:settings` po istem vzorcu (v `backend/scripts/`).
4. **Arhitektura** – Backend modul `settings`: en dokument v Mongo, CRUD v `controllers/settings.controller.ts`, rute registrirane v `backend/routes.ts` pod `/settings`, odgovor prek `res.success/res.fail`. Frontend modul `apps/module-settings` se drži dizajna `module-cenik` (FilterBar, modal). Core-shell manifest + Tailwind content update sta obvezna.
5. **Dokumentacija** – vsako večjo spremembo zabeleži v `docs/TODO.md`, `docs/KOORDINACIJA.md`, `docs/faze/04-NASTAVITVE.md`, `docs/ARHITEKTURA.md`, `docs/MODULES.md`. Fazo označi kot zaključeno šele, ko so backend + frontend + dokumentacija usklajeni.
6. **Testiranje** – `pnpm --filter aintel-backend build`, `pnpm --filter @aintel/core-shell build`, ročni pregled `pnpm run dev:stack`. Če `/api` vrne 404, preveri `backend/core/app.ts` (mora mountati rute pod `/api`). Če skripta ne doseže baze, preveri root `.env`.
7. **Lessons learned iz faze 3** –
   - Skripte naj vedno berejo root `.env` (s tem se izognemo ECONNREFUSED).
   - UI naj sledi obstoječim modulom (Tailwind + @aintel/ui). Kompaktni filter bar in modal urejanje sta referenca.
   - Dokumentacijo posodabljaj sproti.
   - Ob zaključku naredi seed + build + dokumentne posodobitve + zapis v koordinacijo.

S temi koraki bo faza 4 padla brez nepotrebnih preprek.