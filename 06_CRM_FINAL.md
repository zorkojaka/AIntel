FAZA 6 – CRM: Upravljanje s strankami (vnos in urejanje)
🎯 Namen

Vzpostaviti vnosni obrazec za dodajanje novih strank (podjetij ali fizičnih oseb) v modul CRM, z možnostjo poznejšega urejanja in pregledovanja že obstoječih podatkov.

🧱 Obrazec: Ključna polja
Polje	Tip	Obvezno	Opomba
Naziv stranke	string	✅	Ime podjetja ali osebe
Tip stranke	enum	✅	podjetje ali fizična oseba
Davčna številka (DDV)	string	⭕	Samo za podjetja (format SI12345678)
Naslov	string	⭕	Lahko se doda tudi kasneje
E-pošta	string	⭕	Preveri validnost formata
Telefon	string	⭕	Opcijsko
Kontaktna oseba	string	⭕	Če ni isto kot naziv
Oznake (tags)	string[]	⭕	Npr. “VIP”, “počasni plačniki”
Opombe	string	⭕	Za interne informacije
Datum vnosa	date	⚙️	Avtomatsko generirano ob kreiranju
🔁 Funkcionalnosti
1. Modal za dodajanje

Lokacija: gumb “➕ Dodaj stranko” v modulu CRM

Ob kliku se odpre ClientForm v modal oknu

Po oddaji pokliče POST /crm/clients

Če obstaja stranka z enakim naziv + ddv, javi napako

2. Modal za urejanje

Ob kliku na vrstico v tabeli strank se odpre ClientForm z že vnešenimi podatki

Na koncu je gumb “Shrani spremembe”

Kliče PUT /crm/clients/:id

🧩 Komponenta

apps/module-crm/src/components/ClientForm.tsx

Reusable – uporablja se tako za dodajanje kot za urejanje

Validacija z Zod (obvezna polja: naziv, tip)

Pogojno renderiranje polj glede na tip stranke

🔗 Backend API

GET /crm/clients – seznam vseh strank

POST /crm/clients – ustvari novo stranko

GET /crm/clients/:id – pridobi eno stranko

PUT /crm/clients/:id – posodobi stranko

DELETE /crm/clients/:id – izbriše stranko

📘 Povezave z ostalimi moduli

Projekt modul naj uporablja ta obrazec, ko kliknemo “Dodaj stranko”

Kontaktna oseba bo lahko vezana na projekte ali dokumente

✅ Testi

Dodajanje stranke brez naslova mora delovati

DDV preveri samo pri podjetjih

Urejanje spremeni podatke in jih shrani

Seznam se po shranjevanju osveži