# Spletna povpraševanja (web-inquiries)

Modul, ki spletni strani inteligent.si omogoča avtomatsko izdelavo **informativne ponudbe**:
obiskovalec odgovori na kratek intervju → AIntel ustvari stranko v CRM, projekt in zahtevo →
obstoječi engine (`nadaljujNaPonudbo`) izdela ponudbo → sistem jo po obstoječi email poti pošlje stranki.
Spletna stran nikoli ne računa cen; vir resnice je cenik v AIntelu.

## Arhitektura

```
inteligent.si (widget) ──POST──▶ /api/public/inquiries ──▶ CRM stranka ──▶ Projekt ──▶ Zahteva ──▶ nadaljujNaPonudbo() ──▶ OfferVersion ──▶ email stranki
                        ◀─JSON── {ok, inquiryId, offerSummary}
```

- `backend/modules/web-inquiries/` – modul (modeli, service, javne in admin poti)
- `apps/module-settings` → Nastavitve → **Prodaja** → *Spletna povpraševanja* – vtičnik s fiksnimi izbirami
- `apps/web-widget/videonadzor-widget.js` – vgradni widget za spletno stran

## Vklop (checklist)

1. V `backend/.env` dodaj: `AINTEL_WEB_INQUIRY_API_KEY=<dolg naključen niz>` (ročno, agent .env ne spreminja).
2. V AIntelu: Nastavitve → Prodaja → Spletna povpraševanja:
   - izberi **WiFi kamero** in **žično (PoE) kamero** iz cenika,
   - potrdi dneve snemanja, ure napeljave/kamero, metre kabla/kanala,
   - po želji ključ email predloge (kategorija `offer_send`; prazno = privzeta),
   - vklopi **Sprejem spletnih povpraševanj**.
3. Priporočeno: v Nastavitve → Komunikacija dodaj namensko predlogo za spletno informativno ponudbo,
   ki poudari, da je ponudba **informativna** in da se napeljava obračuna po dejanski porabi.
4. Test na testaintel (glej spodaj), nato vgradnja widgeta na inteligent.si.

## Javni API (za spletno stran)

Osnovni URL: `https://testaintel.inteligent.si/api/public` (test) / `https://aintel.inteligent.si/api/public` (produkcija)

Avtentikacija: header `X-API-Key: <AINTEL_WEB_INQUIRY_API_KEY>` na vseh klicih.
CORS: odprt (klic je možen neposredno iz brskalnika). Zaščita: API ključ + rate limit
(10 zahtevkov / 5 min / IP) + zaščita pred podvojeno oddajo (isti email + steber v 10 min → vrne prvotni odgovor).

### GET /api/public/options

Izbire za obrazec – vedno v sinhronizaciji z AIntelom.

```json
{
  "ok": true,
  "enabled": true,
  "pillars": {
    "videonadzor": {
      "enabled": true,
      "cameraCount": { "min": 1, "max": 64 },
      "wiringRule": "Do 3 kamere praviloma WiFi, 4 ali več priporočamo žično izvedbo.",
      "cameras": [
        { "key": "wifi",  "name": "…", "shortDescription": "…", "priceWithVat": 123.45 },
        { "key": "wired", "name": "…", "shortDescription": "…", "priceWithVat": 156.78 }
      ],
      "dniSnemanja": 30
    },
    "alarm": { "enabled": false },
    "domofon": { "enabled": false },
    "pametni_dom": { "enabled": false }
  }
}
```

### POST /api/public/inquiries

**AVTORITATIVNA SHEMA ZAHTEVKA** (spletna stran gradi obrazec proti tej shemi):

```json
{
  "pillar": "videonadzor",            // obvezno; enum: videonadzor | alarm | domofon | pametni_dom
  "contact": {                         // obvezno, vsi stebri
    "firstName": "Janez",             // obvezno, string ≤ 80
    "lastName": "Novak",              // obvezno, string ≤ 80
    "email": "janez@example.com",     // obvezno, veljaven email
    "phone": "041 123 456",           // obvezno, string ≤ 40
    "siteAddress": {                   // obvezno; objekt ali string "Ulica 5, 1000 Ljubljana"
      "street": "Slovenska cesta 1",  // obvezno (za kilometrino)
      "postalCode": "1000",
      "city": "Ljubljana"
    }
  },
  "videonadzor": {                     // obvezno pri pillar=videonadzor
    "cameraCount": 4,                  // obvezno, celo število 1–64
    "wiringType": "wired",            // obvezno, enum: wifi | wired
    "wiringReady": false               // opcijsko, bool, privzeto false (samo za wired)
  },
  "note": "poljubno sporočilo",       // opcijsko, ≤ 1000
  "source": "inteligent.si"           // opcijsko, ≤ 120
}
```

Uspešen odgovor (201):

```json
{
  "ok": true,
  "inquiryId": "665f…",
  "message": "Informativna ponudba je bila poslana na vaš e-naslov.",
  "offerSummary": { "offerNumber": "PONUDBA-2026-123", "totalWithVat": 1234.56, "currency": "EUR", "emailSent": true }
}
```

Napake (vedno `{ ok:false, code, message }`):

| HTTP | code             | pomen                                                        |
|------|------------------|--------------------------------------------------------------|
| 400  | VALIDATION_ERROR | manjkajoč/neveljaven podatek (message pove kateri)           |
| 401  | UNAUTHORIZED     | napačen X-API-Key                                            |
| 429  | RATE_LIMITED     | preveč zahtevkov z istega IP                                 |
| 502  | ENGINE_ERROR     | ponudbe ni bilo mogoče izdelati (povpraševanje JE shranjeno) |
| 503  | NOT_CONFIGURED   | vtičnik izklopljen / kamere niso izbrane / ni API ključa     |
| 500  | SERVER_ERROR     | nepričakovana napaka                                         |

Stebri `alarm`, `domofon`, `pametni_dom`: zahtevek je sprejet in shranjen (CRM stranka + zapis povpraševanja,
status `novo`), samodejna ponudba pa se za zdaj ne izdela — odgovor je `ok:true` s sporočilom
"Povpraševanje smo prejeli…". Engine pot se vklopi po stebrih, ko bodo definirane fiksne izbire.

## Kaj se zgodi ob videonadzor povpraševanju (koraki in privzete izbire)

1. **CRM stranka**: najde po emailu ali ustvari novo (`type: individual`, tag `spletno-povprasevanje`).
   Ob koliziji imena z drugo stranko dobi ime pripono »(2)« — povezava projekt→stranka gre po imenu.
2. **Projekt**: `Videonadzor – Ime Priimek`, status `draft`, kategorija `videonadzor`, naslov objekta v `customer.address`.
3. **Zahteva** (modul `zahteve`):
   - kamera = fiksna izbira iz vtičnika (wifi ali wired), 1 varianta, N lokacij »Kamera 1..N«,
   - nosilci: najcenejši združljiv nosilec (če vklopljeno),
   - wired: snemalnik prek `predlagajSnemalnik` (PoE, ustrezno št. kanalov), po potrebi PoE switch,
     disk prek kalkulatorja (dnevi snemanja + gibanje iz vtičnika),
   - scenarij izvedbe iz vtičnika (wifi / napeljava obstaja / potrebna napeljava),
   - ocene: ure napeljave, m UTP, m kanala = nastavitev × št. kamer (samo pri potrebni napeljavi),
   - **kilometrina: engine sam geokodira naslov (ORS) in vpiše povratno razdaljo**; spletna stran pošlje samo naslov.
     Če izračun ne uspe, je km=0 in v zapisu povpraševanja je opomba za ročni pregled.
4. **Ponudba**: `nadaljujNaPonudbo()` → obstoječi engine, cenik, DDV, številka dokumenta, izvedbena pravila (montaža ipd.).
5. **Email**: obstoječa pot `sendOfferCommunicationEmail` s PDF ponudbe, predloga `offer_send`.
6. **Sled**: vse je vidno v Nastavitve → Prodaja → Spletna povpraševanja (status, ponudba, znesek,
   seznam vseh samodejno uporabljenih privzetih izbir, morebitna napaka).

## Admin API (za AIntel UI, zahteva prijavo, vloge ADMIN/SALES)

- `GET /api/web-inquiries/settings` / `PUT /api/web-inquiries/settings` – nastavitve vtičnika
- `GET /api/web-inquiries?limit=50` – zadnja povpraševanja

## Widget za spletno stran

`apps/web-widget/videonadzor-widget.js` – samostojen JS (brez knjižnic). Vgradnja:

```html
<div id="aintel-ponudba"></div>
<script src="/pot/do/videonadzor-widget.js"></script>
<script>
  AintelInquiry.init({
    container: '#aintel-ponudba',
    apiBase: 'https://testaintel.inteligent.si/api/public',
    apiKey: 'ISTI-KLJUC-KOT-V-ENV',
  });
</script>
```

Koraki: št. kamer → wifi/žično (s cenami iz /options, priporočilo po pravilu 1–3/4+) → napeljava da/ne →
kontakt + naslov + soglasje → oddaja → potrditveni zaslon s št. ponudbe.

**Opomba o ključu:** ker widget kliče API neposredno iz brskalnika, je ključ javno viden v kodi strani.
Služi kot filter proti naključni zlorabi (skupaj z rate limitom), ne kot skrivnost. Če želiš ključ skriti,
naj WordPress stran postavi proxy (stran → strežnik inteligent.si → AIntel) — kontrakt ostane enak.

## Test na testaintel (po deployu)

```bash
curl -s https://testaintel.inteligent.si/api/public/options -H "X-API-Key: $KEY" | jq
curl -s -X POST https://testaintel.inteligent.si/api/public/inquiries \
  -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d '{"pillar":"videonadzor","contact":{"firstName":"Test","lastName":"Splet","email":"jaka@inteligent.si","phone":"051222135","siteAddress":{"street":"Tvoj naslov 1","postalCode":"1000","city":"Ljubljana"}},"videonadzor":{"cameraCount":4,"wiringType":"wired","wiringReady":false}}' | jq
```

⚠ Staging in produkcija delita isto bazo — testno povpraševanje ustvari pravi projekt in porabi
pravo številko ponudbe. Testiraj s svojim emailom in projekt nato arhiviraj.

Pred tem lahko na strežniku poženeš read-only preverjanje:
`cd backend && npx ts-node --transpile-only scripts/web-inquiries-preflight.ts`

## Vrzeli / privzete izbire, ki jih potrdi Jaka

- WiFi in žična kamera – **obvezna izbira v vtičniku** (brez tega videonadzor vrne NOT_CONFIGURED).
- Snemalnik, switch, disk, nosilci – samodejni predlogi engine-a (najcenejši ustrezen); vidno v ponudbi.
- Dnevi snemanja (30), snemanje ob gibanju (ne), ure napeljave/kamero (1), m UTP/kamero (20), m kanala/kamero (5) – nastavljivo v vtičniku.
- Scenariji izvedbe: wifi→izvedba, napeljava obstaja→izvedba, ni napeljave→izvedba+napeljava – nastavljivo.
- Email predloga: privzeta `offer_send` predloga; priporočena namenska predloga za informativne ponudbe.
- Stebri alarm/domofon/pametni dom: sprejem da, avtomatska ponudba še ne (potrebne fiksne izbire po stebrih).
