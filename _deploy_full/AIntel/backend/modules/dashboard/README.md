# Dashboard modul

Dashboard je prvi aktivni modul, ki prikazuje osnovne metrike sistema in omogoča razširitve drugih modulov.

## Rute

- `GET /dashboard/stats` – vrne dummy metrike (`users`, `projects`, `activeWidgets`), ki jih lahko drugi moduli razširijo z dodatnimi widgeti.

## Razširitve

1. Dodaj nov kontroler v `modules/<module>/controllers`, ki izračuna svoje metrike.
2. Uporabi `modules/dashboard/routes` ali skupne widget storitve za vstavljanje teh vrednosti.
3. Zapomni si, da so besedila v slovenščini, ključi pa ostanejo v angleščini.
