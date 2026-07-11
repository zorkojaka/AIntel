# Načrt: follow-up e-mail na klik + branje dohodne pošte

Lastnikova zahteva (2026-07-09): (1) ko ponudba en teden ni potrjena, dobi
opravilo, kjer z enim klikom pošlje pripravljen follow-up e-mail izbranim
strankam — pošiljanje je VEDNO ročno s predogledom (lastnikov princip: nič
avtomatskih mailov); (2) namenski e-poštni naslov, ki ga sistem bere in sam
posodablja projekte, da je vidna celotna sled komunikacije.

Povezano: AINTEL_WHEEL_SPEC.md (opravila+pravila, offer.follow_up že ustvarja
opravilo po 7 dneh tišine — privzeto spremenjeno s 3 na 7 dni),
MAILING_AND_SEGMENTATION.md (izhodni mailing, ekosistem).

## AIN-P1-13 — Follow-up e-mail iz opravila (en klik, ročno pošiljanje)

Status 2026-07-09: izvedeno. Opravilo `offer.follow_up` ima ročni gumb za
predogled, paketni izbor v Opravilih, eksplicitno pošiljanje prek obstoječega
communication modula in zaključek opravila šele po uspešnem pošiljanju. Če
aktivna šablona `offer_follow_up` ne obstaja, sistem uporabi vgrajen varen
follow-up tekst; pošiljanje ostaja vedno ročno.

Kaj: opravilo tipa `offer.follow_up` v Opravilih dobi gumb **»Pripravi
follow-up e-mail«**:

1. Nova komunikacijska šablona `offer_follow_up` (template modul že obstaja;
   spremenljivke: ime stranke, št. ponudbe, znesek, povezava/priloga PDF).
2. Klik odpre PREDOGLED (prejemnik, zadeva, telo, priloga) → lastnik potrdi
   »Pošlji« → pošlje se prek obstoječega communication modula, zabeleži se
   communication event + vnos v project timeline, opravilo se zaključi z
   izidom `follow-up mail poslan`.
3. Paketni pogled: v Opravilih filter »follow-up« s kljukicami → seznam
   predogledov → pošlji izbranim (vsak mail ločeno zabeležen). Lastnik lahko
   posamezno opravilo namesto tega zaključi ročno (»klical, ne bodo«) — mail
   se NE pošlje.
4. NIKOLI avtomatskega pošiljanja; pravilo ustvari samo opravilo.

Odvisnosti: P1-09/P1-11 (izvedeno), communication templates (obstaja).
Obseg: M (backend endpoint »prepare+send from task« + UI v module-tasks).

## AIN-P1-14 — Dohodna pošta: namenski nabiralnik → projektna sled

Kaj: sistem bere namenski nabiralnik (npr. prodaja@ ali sistem@inteligent.si —
lastnik izbere/ustvari) in dohodne maile pripenja na prave projekte.

Faze:

- **F0 (lastnik)**: nov namenski naslov; IMAP poverilnice v backend/.env
  (IMAP_HOST/USER/PASSWORD). Vsa pošta strankam se pošilja s tem naslovom
  (sender-settings), da odgovori pridejo nazaj v ta nabiralnik.
- **F1 poller**: scheduler job (vsakih ~5 min) prek IMAP prebere nove maile
  in jih surove shrani v novo kolekcijo `email_messages` (messageId,
  inReplyTo/references, from, to, subject, očiščen text/html, meta prilog).
  Nabiralnika NE spreminja razen oznake »prebrano«; brez brisanja; brez
  samodejnih odgovorov. Nova odvisnost: `imapflow` + `mailparser`
  (lastnik potrdi paketa).
- **F2 ujemanje**: (a) In-Reply-To/References ↔ messageId poslanih sporočil
  (communication_messages ob pošiljanju shrani svoj messageId — dopolniti),
  (b) pošiljateljev e-naslov ↔ CRM stranka ↔ odprti projekti,
  (c) PON-#### / PRJ-### v zadevi ali telesu.
- **F3 prikaz**: zadetek → vnos v project timeline (»prejet e-mail«) +
  nit komunikacije na projektu (poslano in prejeto skupaj = vidna sled);
  brez zadetka → opravilo `email.unmatched` v SALES bazen (ročna povezava).
- **F4 kolo**: odgovor stranke na ponudbo samodejno zaključi odprto
  `offer.follow_up` opravilo (»stranka odgovorila po e-pošti«) in ustvari
  opravilo »preberi odgovor stranke«.

Meje: samo branje in beleženje — sistem na pošto NIKOLI ne odgovarja sam;
poverilnice samo v .env; priloge v F1 samo metapodatki (prenos kasneje po
potrebi). Obseg: L (fazno).

## AIN-P1-15 — Reševalna akcija: koda za popust po tednu tišine

Lastnikova ideja (2026-07-09): namesto 5 % popusta vnaprej dobi stranka po
~tednu neodzvane ponudbe e-mail s KODO za 5 % popusta na naročilo nad
določeno vrednostjo, z rokom veljavnosti. Popust plačamo samo pri strankah,
ki bi sicer odpadle; koda z rokom ustvari odločitev zdaj; unovčenje = merljiv
učinek akcije.

Sestavni deli:

1. **Kuponi (mali modul v AIntelu)**: koda (enkratna, per-stranka), odstotek,
   min. vrednost naročila, veljavnost, se NE sešteva s količinskimi popusti;
   unovčenje ob potrditvi ponudbe/naročila (prodajnik vnese ali sistem
   preveri), evidenca unovčenj. (Predviden že v SHOPIFY_REPLACEMENT_PLAN
   »kuponi = nov mali modul, po potrebi« — potreba je zdaj.)
2. **Pravilo `offer.rescue_discount`** (kolo): ponudba poslana +X dni (za
   follow-upom, npr. 10–14 dni), stranka IMA marketinško soglasje (ECO-09 /
   portal soglasja) in ponudba nad pragom → pripravi kampanjsko opravilo s
   PREDOGLEDOM maila (šablona s kodo). Pošiljanje ročno s klikom (paket kot
   P1-13); pravi avto-način je ločeno stikalo, ki se vklopi šele po
   lastnikovem zaupanju.
3. **Merjenje**: unovčene kode ↔ ponudbe (rešene ponudbe, prihodek akcije) →
   kartica v dashboardu (ECO-13 lijak).

GDPR: samo prejemniki z marketinško privolitvijo; odjava v vsakem mailu.
Odvisnosti: P1-13 (mehanika pošiljanja iz opravila), ECO-09/10 (soglasja),
kuponi modul. Parametri (odstotek, prag, roki) nastavljivi v wheel/kuponi
konfiguraciji — brez trdo kodiranih vrednosti.

## AI pomoč pri pošti (AIN-P1-21 … AIN-P1-25)

Lastnikova zahteva (2026-07-11): naloge za AI pomoč pri pošti. Nadgradnja
zgornjega načrta — AI pomaga pri branju, razvrščanju in pisanju, NIKOLI pa ne
pošilja sam in NIKOLI ne računa cen.

### Trdna pravila (veljajo za vse AI naloge)

1. **Nič avtomatskega pošiljanja.** AI pripravi OSNUTEK; človek ga vidi v
   predogledu, lahko uredi in šele nato ročno pošlje (ista mehanika kot P1-13).
2. **Cene/popusti/statusi so deterministični iz AIntela.** AI dobi te podatke
   kot vhod in jih sme samo citirati — nikoli izračunati ali izmisliti. Enako
   načelo kot »ponudba nikoli iz AI« (AGENTS.md).
3. **AI besedilo je označeno** (v UI »✨ AI osnutek — preveri pred pošiljanjem«)
   in zabeleženo (kdo je potrdil, kaj je bilo spremenjeno).
4. **Poverilnice samo v backend/.env** (`ANTHROPIC_API_KEY`, owner). Model
   nastavljiv prek env (`AINTEL_AI_MODEL`, privzeto `claude-opus-4-8`).
5. **Vsak AI klic v dnevnik**: namen, model, input/output tokeni, ocena stroška,
   trajanje. Mesečna varovalka (`AINTEL_AI_MONTHLY_LIMIT_EUR`) — ko je presežena,
   AI funkcije vrnejo »izklopljeno«, ročni tok dela naprej.
6. **AI je opcijski sloj**: vse mora delovati tudi brez njega (feature flag
   `AINTEL_AI_ENABLED`); izpad API-ja ne sme podreti nobenega toka.
7. **GDPR/DPA (owner, D-AI1)**: vsebina strankine pošte gre v obdelavo
   Anthropic API (podatki se ne uporabljajo za učenje; standardna hramba).
   Owner potrdi obdelavo + doda omembo v pravilnik o zasebnosti.

### AIN-P1-21 — AI temelj: `ai.service` v AIntel backendu

Majhen modul `backend/modules/ai/` z `@anthropic-ai/sdk` (TypeScript):
`aiKlic({namen, sistem, vsebina, shema?})` → en klic Messages API
(`client.messages.create`, model iz env, `output_config.format` z JSON shemo
za strukturirane izhode, adaptivno razmišljanje privzeto). Vgrajeno: dnevnik
klicev (nova kolekcija `ai_calls`), stroškovna varovalka, feature flag, retry
prek SDK (max_retries), timeout. Brez frontenda. Effort: S–M.
Odvisnosti: owner D-AI1 (ključ + DPA + potrditev modela).

### AIN-P1-22 — AI triaža dohodne pošte

Nadgradnja P1-14: ob shranjenem sporočilu v `email_messages` (F1) AI vrne
strukturirano: kategorija (odgovor_na_ponudbo / novo_povprasevanje / servis /
racun_dobavitelja / spam / drugo), nujnost (1–3), povzetek v 1–2 stavkih,
osnutek naslova opravila. Kadar hevristično ujemanje (F2) ne najde projekta,
AI predlaga stranko/projekt s stopnjo zaupanja — SAMO predlog v opravilu
`email.unmatched`, poveže človek. Rezultat se shrani na sporočilo
(`aiTriaza` polje) in prikaže v opravilu/niti. Effort: M.
Odvisnosti: P1-14 F1+F2, P1-21.

### AIN-P1-23 — AI osnutek odgovora na strankin mail

Gumb »✨ Pripravi osnutek odgovora« na projektni komunikacijski niti in na
opravilih `email.unmatched`/»preberi odgovor stranke«. Kontekst za AI:
zadnja sporočila niti, status projekta/ponudbe (št. ponudbe, znesek — kot
podatek), dogovorjeni naslednji koraki. Izhod: slovenski osnutek (vikanje,
podpis iz sender-settings), ki se odpre v OBSTOJEČEM predogledu za ročno
pošiljanje (P1-13 mehanika). Nikoli ne obljublja cen/rokov, ki jih ni v
vhodnih podatkih. Effort: M. Odvisnosti: P1-14 F3, P1-21, P2-04 (skupni
send pipeline — soft).

### AIN-P1-24 — AI povzetek komunikacijske niti na projektu

Kartica »Povzetek komunikacije« na projektu: kaj stranka želi, odprta
vprašanja, kaj smo obljubili (+datumi), zadnji kontakt. Osveži se ob novem
dohodnem/odhodnem sporočilu (ali ročni gumb); shranjen povzetek, ne klic ob
vsakem prikazu. Effort: S–M. Odvisnosti: P1-14 F3, P1-21.

### AIN-P1-25 — AI personalizacija follow-up / reševalnih mailov

Nadgradnja P1-13/P1-15: v predogledu follow-upa gumb »✨ Personaliziraj uvod« —
AI napiše 1–2 uvodna stavka glede na zgodovino projekta (kaj je stranka
spraševala, kaj je bilo dogovorjeno), OSTALO iz šablone ostane nespremenjeno
(zneski, koda, povezave = deterministični). Diff prikaz proti šabloni;
pošiljanje ročno. Effort: S. Odvisnosti: P1-13 (DONE), P1-21; za kupone P1-15.

### Priporočen model in strošek (ocena, potrdi owner v D-AI1)

Privzeto `claude-opus-4-8` ($5/$25 na mio tokenov): tipičen triažni klic
(~2k vhod, ~300 izhod) ≈ 0,02 USD; osnutek odgovora ≈ 0,03–0,05 USD. Pri
deset mailih/dan skupaj nekaj EUR/mesec. Za masovno triažo lahko owner izbere
`claude-haiku-4-5` ($1/$5) — nastavljivo prek `AINTEL_AI_MODEL` brez spremembe
kode. Odločitev + ključ + DPA = **D-AI1** (owner).
