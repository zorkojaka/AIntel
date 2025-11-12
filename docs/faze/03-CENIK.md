# FAZA 3: Cenik

## Cilj
Vzpostaviti modularen cenik izdelkov in storitev, ki uporablja slovenska polja v Mongoose modelu, CRUD API in interaktivni UI z iskanjem/filtri/obrazcem.

## Backend
- `backend/modules/cenik/product.model.ts`: `Product` shema s polji `ime`, `kategorija`, `nabavnaCena`, `prodajnaCena`, `kratekOpis`, `dolgOpis`, `povezavaDoSlike`, `proizvajalec`, `dobavitelj`, `povezavaDoProdukta`, `naslovDobavitelja`, `casovnaNorma`.
- `controllers/cenik.controller.ts`: `getAllProducts`, `getProductById`, `createProduct`, `updateProduct`, `deleteProduct` z `res.success`/`res.fail`.
- `routes/cenik.routes.ts`: `GET/POST/PUT/DELETE` poti `products`, registrirano v `backend/routes.ts` pod `/cenik`.
- `backend/modules/cenik/README.md`: opis sheme, endpointov in možnih razširitev.

## Frontend
- `apps/module-cenik/src/manifest.ts`: modul registrira `CenikPage` in nav item `Cenik`.
- `CenikPage.tsx` (glavna komponenta): naloži `/api/cenik/products`, omogoči filter po kategoriji, iskanje po imenu, obrazec za dodajanje/urejanje s `@aintel/ui` komponentami in `tailwind` razredi, ter `DataTable` za akcije (uredi/izbriši).
- `globals.css/styles.css`: Tailwind utility razredi (var-števila, `.text-destructive`, `.border-success`), `@tailwind` direktive.
- `apps/core-shell` vključuje modul v `App.tsx`, `CoreLayout.tsx`, `main.tsx` in `tailwind.config.ts`/`postcss.config.cjs` obdelata vse module; `package.json` skripte (dev/dev:all/dev:stack) so razširjene na `@aintel/module-cenik`.

## Testni koraki
1. `pnpm run dev:stack` (ali `pnpm --filter aintel-backend dev` + module). V brskalniku se prepričaj, da `/cenik` modul prikaže seznam.
2. `GET /api/cenik/products` vrne `success` envelope z `data` (morda prazen array).
3. `POST /api/cenik/products` ustvari nov produkt; preveri, da se pojavi v tabeli in API vrne `success`.
4. Uredi obstoječi produkt (click "Uredi", spremeni ceno) in shrani; preveri, da se spremembe odsevajo v tabeli in `GET` vrne nove vrednosti.
5. Izbriši produkt preko gumba "Izbriši" in potrdi; tabela se posodobi, `DELETE` API vrne `success`, `GET /products` pa ga ne najde.
6. Filtriraj po kategoriji (npr. `material`) in išči po imenu (npr. `blebox`); preveri, da se tabela filtrira in ob manjkajočem nizu prikaže sporočilo "Ni najdenih produktov.".
7. Preveri, da ni React opozoril v konzoli, da so placeholderji in gumbi v slovenščini, da tailwind razredi uporabljajo `var(--...)` in da so statusne povezave (success/destructive) vidne.

## Dokumentacija
- Posodobi `docs/MODULES.md`, `docs/TODO.md`, `docs/KOORDINACIJA.md` (nov razdelek) in `docs/faze/03-CENIK.md` pri vsakem večjem napredku.
- Uporabi `Cenik___Pripravljena_Struktura.csv` in skripto `backend/scripts/seed-cenik.ts`, da popolni nabor podatkov naliješ v MongoDB (`pnpm --filter aintel-backend seed:cenik`).
- Po uvozu preveri, da so API klici `/api/cenik/products` polni realnih artiklov in da UI sporoči prave kategorije/cene brez 404 napak.
