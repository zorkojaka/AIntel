# Cenik modul

Cenik modul v backendu AIntel hrani artikle, storitve in povezane opise. Uporablja se enotni `{ success, data, error }` `core/response` format in `normalizePayload` middleware, zato so odgovori dosledni z ostalimi moduli.

## Shema
- `Product` (`modules/cenik/product.model.ts`) definira:
  - `ime`, `kategorija`, `nabavnaCena`, `prodajnaCena` (obvezna polja, cene so omejene na pozitivne vrednosti)
  - `kratekOpis`, `dolgOpis`, `povezavaDoSlike`, `proizvajalec`, `dobavitelj`, `povezavaDoProdukta`, `naslovDobavitelja`, `casovnaNorma`
  - `timestamps` za sledenje spreminjanju

## Rute
- `GET /cenik/products` – vrne vse produkte v zbirki.
- `GET /cenik/products/:id` – pridobi podrobnosti produkta (404, če ni).
- `POST /cenik/products` – ustvari nov produkt (ime in kategorija sta obvezni).
- `PUT /cenik/products/:id` – posodobi produkt in vrne nove podatke.
- `DELETE /cenik/products/:id` – izbriše produkt in vrne potrditveno sporočilo.

## Razširitve
1. Če je treba, dodamo napredno filtriranje ali paginacijo prek query parametrov.
2. Metrične podatke lahko prispevamo v `modules/dashboard` (npr. število izdelkov ali kategorij).
3. Sledimo navodilom v `03_CENIK.md` (root) in `docs/faze/03-CENIK.md` pri dodatnih spremembah.
