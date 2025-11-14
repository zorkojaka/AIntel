# Modul Finance (FAZA 5)

Modul Finance centralizira podatke iz računov in jih povezuje s projekti ter CRM evidencami.
V tej fazi je modul zasnovan kot in-memory storitev, ki ponuja osnovne API-je za zajem
računov in pregled finančnih kazalnikov po projektih, strankah ter časovnih obdobjih.

## Model: `FinanceEntry`
| Polje              | Opis                                                    |
|--------------------|---------------------------------------------------------|
| `id`               | Interni identifikator zapisa                             |
| `id_projekta`      | Referenca na projekt (npr. `PRJ-002`)                    |
| `id_racuna`        | Identifikator dokumenta tipa račun                       |
| `datum_izdaje`     | Datum izdaje računa (ISO `YYYY-MM-DD`)                   |
| `znesek_skupaj`    | Končni znesek računa z DDV                               |
| `ddv`              | Znesek DDV                                               |
| `znesek_brez_ddv`  | Neto znesek brez DDV                                     |
| `nabavna_vrednost` | Skupni strošek artiklov iz cenika                        |
| `dobicek`          | Razlika `znesek_brez_ddv - nabavna_vrednost`             |
| `stranka`          | Ime stranke iz CRM                                       |
| `artikli`          | Seznam artiklov (naziv, količina, nabavna/prodajna cena) |
| `kategorija_prihodka` | Ena izmed: `storitev`, `oprema`, `vzdrževanje`, `drugo` |
| `oznaka`           | Status računa (`plačano`, `čaka na plačilo`, `preklicano`) |

## API
Base pot: `/finance`

| Metoda | Pot               | Opis                                                          |
|--------|-------------------|---------------------------------------------------------------|
| GET    | `/`               | Vrne seznam vseh FinanceEntry zapisov                         |
| POST   | `/addFromInvoice` | Zapiše nov `FinanceEntry` na podlagi podatkov računa          |
| GET    | `/yearly-summary` | Vrne agregacijo prihodkov/stroškov po mesecih in kategorijah  |
| GET    | `/project/:id`    | Vrne finančni povzetek in račune za izbran projekt            |
| GET    | `/client/:id`     | Vrne finančni povzetek in račune za izbrano stranko           |

## Testiranje
1. Zaženite backend: `pnpm --filter aintel-backend dev`
2. Pošljite POST na `/finance/addFromInvoice` z vsaj enim artiklom.
3. Preverite agregacijo: `GET /finance/yearly-summary?year=2025`.
4. Uporabite `GET /finance/project/PRJ-002` ali `GET /finance/client/Hotel%20Panorama`.
