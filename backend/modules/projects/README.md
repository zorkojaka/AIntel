# Modul Projekti (FAZA 2)

Modul skrbi za evidenco projektov, statusno logiko in časovnice dokumentov. V tej fazi deluje na in-memory podatkih, zato je
primeren za razvoj in testiranje UI modula `apps/module-projects`.

## Modeli
- `ProjectDetail` – vsebuje osnovne podatke (naziv, stranka, status, zneski) in povezave do postavk, ponudb, delovnih nalogov ter
  časovnice.
- `ProjectItem` – postavke ponudbe (vezane na prihodnji modul Cenik).
- `ProjectOffer` – verzije ponudb s statusi `draft/sent/accepted` in oznako izbrane verzije.
- `ProjectTimelineEvent` – dogodki (ponudbe, naročilnice, dobavnice, statusi) s časom in metapodatki.

## API rute
| Metoda | Pot | Opis |
| --- | --- | --- |
| GET | `/projects` | Vrne seznam projektov s povzetki (za tabelo v ProjectList) |
| POST | `/projects` | Ustvari nov projekt na podlagi naziva in stranke |
| GET | `/projects/:id` | Vrne detajle projekta za delovni prostor |
| GET | `/projects/:id/timeline` | Samostojen vpogled v časovnico projekta |
| POST | `/projects/:id/confirm-phase` | Potrdi fazo (ponudba, dobavnica, zaključek) in doda timeline vnos |

Vsi kontrolerji uporabljajo `res.success` / `res.fail`, zato se odzivi držijo JSON standarda `{ success, data, error }`.

## TODO naslednji koraki
- Persistenca v MongoDB in povezava s CRM/Cenik entitetami
- API za postavke iz cenika (`POST /projects/:id/items`)
- Dejansko ustvarjanje dokumentov (ponudba → naročilnica → delovni nalog → dobavnica → račun)
