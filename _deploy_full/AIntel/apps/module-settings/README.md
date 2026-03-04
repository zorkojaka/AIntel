# Modul Nastavitve (`@aintel/module-settings`)

Ta paket predstavlja celoten frontend za fazo 4 – centralne nastavitve.

## Struktura
- `src/SettingsPage.tsx`: glavni obrazec (osnovni podatki, logotip, barve, prefiksi dokumentov in PDF predogled).
- `src/api.ts`: helperji za `GET /api/settings` in `PUT /api/settings`.
- `src/hooks/useSettings.ts`: hook za pridobivanje nastavitev in posodobitev teme, ki ga uporablja tudi CRM in Projekti.
- `src/manifest.ts`: definira manifest modula z ruto `/nastavitve`.

## Uporaba v jedru
Core-shell v `src/App.tsx` importira `SettingsPage`, `CoreLayout` pa v navigacijo doda `settingsManifest`, zato je stran takoj dostopna preko menija (ali neposredno na `/nastavitve`).

## Testni potek
1. V rootu poženi `pnpm --filter aintel-backend seed:settings`, da se v MongoDB ustvari privzeti dokument.
2. Zagon celotnega sklada: `pnpm run dev:stack`.
3. V brskalniku odpri `/nastavitve`, spremeni npr. kontaktni podatek in klikni »Shrani«.
4. Preveri, da `PUT /api/settings` vrne uspešen odziv, PDF predogled prikaže posodobitev in da se isti podatki prikažejo v CRM/Projektih po osvežitvi.

S tem README je jasno, da se celotna implementacija nahaja v `apps/module-settings` in je pripravljena za nadaljnje delo.
