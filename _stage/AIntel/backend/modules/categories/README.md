# Categories module

Centralnajšoli kategorije za cenik, projekte in druge module.

## Routes
- `GET /categories` – vrne vse kategorije, urejene po `order`.
- `POST /categories` – ustvari novo kategorijo z `name`, `slug`, `color`, `order`.

## Usage
- `Product` v ceniku naj uporablja `categorySlug`.
- `Project` shrani `categories: string[]`.
