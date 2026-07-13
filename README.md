# 🧠 AIntel – Inteligentni Modularni Sistem

Dobrodošli v AIntel – poslovni sistem nove generacije, razvit za inteligentno avtomatizacijo poslovanja podjetij. Projekt je modularno zgrajen, razširljiv in pripravljen za integracijo AI agentov.

---

## 🚀 Vizija
Zasnovati centralno aplikacijo z:
- Modularnimi funkcionalnostmi (CRM, projekti, finance …)
- Razširljivim dashboardom in menijem
- Povezljivostjo z MongoDB
- Slovensko lokalizacijo in podporo šumnikom
- Vgrajeno dokumentacijo in TODO sledenjem

---

## 🏗️ Arhitektura
Glej `docs/ARHITEKTURA.md` za opis strukture aplikacije.

```
/backend
  ├─ core/              # Inicializacija in shared logika
  ├─ modules/           # Posamezni moduli (CRM, projekti ...)
  ├─ db/                # Mongo povezava
  ├─ utils/             # Helperji (normalizeUnicode ...)
  ├─ docs/              # Dokumentacija (CORE, TODO, navodila)
```

---

## 🔧 Tehnologije
- Node.js + Express
- MongoDB (prek Mongoose)
- Unicode NFC normalizacija
- JSON API z enotnim `success/data/error` odzivom
- `.env` konfiguracija

---

## 📂 Moduli (faze)
| Faza | Modul     | Namen                                |
|------|-----------|---------------------------------------|
| 0    | CORE      | Ogrodje, baza, unicode, dashboard     |
| 1    | CRM       | Stiki, podjetja, zgodovina            |
| 2    | Projekti  | Dokumenti, statusi, timeline          |
| 3    | Cenik     | Artikli, cene, kategorije             |
| 4    | Nastavitve| Uporabniki, vloge, sistemski podatki  |
| 5    | Finance   | Računi, bilance, knjigovodska poročila|

---

## 📘 Dokumentacija
Vsa navodila, status in opombe najdeš v mapi `docs/`.

- `docs/ARHITEKTURA.md` – struktura aplikacije
- `docs/TODO.md` – sledenje napredku
- `docs/faza0-Core.md` – navodila za CORE implementacijo

---

## ✅ Zagon projekta

```bash
npm install
cp .env.example .env
# Dodaj MONGO_URI in MONGO_DB v .env
npm run dev
```

Aplikacija bo dostopna na `http://localhost:3000`.

### Staging varnost

Staging ne sme uporabljati produkcijske baze `inteligent`. Za staging nastavi
`AINTEL_ENV=staging` in ločen `MONGO_DB` (npr. `inteligent_staging`); backend ob zagonu
zavrne kombinacijo `AINTEL_ENV=staging` + `MONGO_DB=inteligent`. Staging emaili morajo
imeti nastavljen `AINTEL_EMAIL_TRAP_TO` in `AINTEL_EMAIL_SUBJECT_PREFIX=[STAGING]`, da
ne dosežejo strank. Postopek je opisan v
`docs/aintel-audit/STAGING_ISOLATION_RUNBOOK.md`.

### Sinhronizacija funkcijskih vej

Če v lokalni kopiji ne vidiš najnovejših modulov (npr. `apps/module-settings` iz faze 4 – Nastavitve), posodobi vejo neposredno iz oddaljenega repozitorija:

```bash
git fetch origin 04_nastavitve
git checkout 04_nastavitve
```

Po preklopu lahko narediš `git merge` ali `git rebase` na svojo delovno vejo in ponovno zaženeš `pnpm install && pnpm run dev`, da se modul pojavi v core-shell navigaciji.

---

## 📎 Kontakt & vzdrževanje
Projekt vodi: **Jaka @ Inteligent d.o.o.**  
Tehnična vprašanja: vodijo AI agenti znotraj sistema (glej TODO.md za sledenje).

