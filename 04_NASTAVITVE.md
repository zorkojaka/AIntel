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

Agent naj označi napredek v docs/TODO.md in fazni dokument docs/faze/05-NASTAVITVE.md.