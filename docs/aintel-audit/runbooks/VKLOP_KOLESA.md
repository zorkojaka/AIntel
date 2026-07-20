# Vklop pravil kolesa — navodilo za lastnika

Datum: 2026-07-16. Vsa pravila so vgrajena in testirana, a **privzeto izklopljena**.
Vklapljaš jih v AIntelu: **Nastavitve → Opravila** (razdelek s pravili kolesa),
vsako pravilo posebej. Vsako ima tri stopnje:

- **izklopljeno** — nič se ne zgodi (trenutno stanje);
- **ročno** — sistem pripravi (opravilo / predizbran checkbox), ti potrdiš z enim klikom;
- **avtomatsko** — zgodi se samo od sebe.

Izklop pravila je vedno varen: opravila so le dodatni zapisi, nič se ne briše.

## Priporočen vrstni red vklopa (teden za tednom)

| Teden | Pravilo | Stopnja | Zakaj najprej |
|---|---|---|---|
| 1 | Naslednji korak povpraševanja (`inquiry.next_step`) | avtomatsko | Stranka je izbrala posvet/ogled/avans — točno tvoj primer »posreduje samo pri klicu«. Opravilo z rokom, nič ne pade skozi. |
| 1 | Prvi kontakt povpraševanja (`inquiry.first_contact`) | avtomatsko | Vsako novo povpraševanje dobi lastnika in rok znotraj delovnega časa. |
| 2 | Follow-up poslane ponudbe (`offer.follow_up`) | ročno | Ob pošiljanju ponudbe je checkbox predizbran; scan ne teče. Ko zaupaš → avtomatsko. |
| 2 | Branje prodajnega nabiralnika (`email.ingest`) | avtomatsko | Pogoj za bančna plačila; samo bere, nikoli ne odgovarja. (Če že teče, pusti.) |
| 3 | Prilivi iz bančnih obvestil (`payment.bank_email`) | ročno | Najprej nastavi §Bančna obvestila spodaj. Ročno = vsak priliv potrdiš v Opravilih; po ~2 tednih brez napačnih ujemanj → avtomatsko. |
| 3 | Potek veljavnosti ponudbe (`offer.expiry`) | avtomatsko | Opomnik »podaljšaj ali zapri« pred iztekom. |
| 4 | Zamuda dobave materiala (`material.late_delivery`) | avtomatsko | Deluje šele, ko naročila dosledno dobijo »predviden datum dobave«. |
| 4 | Servisni sprejem (`service.ticket_intake`) | avtomatsko | Nov zahtevek → opravilo za ekipo. |
| po potrebi | Vzdrževanje (`maintenance.due`) | avtomatsko | Ko so vneseni plani vzdrževanja. |
| po potrebi | Eskalacija (`inquiry.stale_escalation`) | avtomatsko | Šele ko prva dva tedna pravil tečeta gladko — sicer takoj zasuje. |

Parametri (isti zaslon): follow-up po **4 dneh**, eskalacija po **2 delovnih dneh**,
zamuda dobave po **2 dneh**, delovni čas 8–16 — vse spremenljivo kadar koli.

## Bančna obvestila (pogoj za `payment.bank_email`)

1. V spletni banki vklopi e-obvestila o prilivih in jim nastavi **posredovanje na
   prodaja@inteligent.si** (ali dodaj prodaja@ kot prejemnika obvestil).
2. En tak mail posreduj tudi meni/agentu — da preverimo, ali parser pravilno
   prebere znesek in sklic tvoje banke.
3. Vpiši pošiljatelja banke v nastavitev `finance.bank` (config API ali agent):
   `senders: ["<domena-banke.si>"]`. Brez tega se nič ne prepozna.
4. Preveri, da je v Nastavitvah podjetja vpisan **IBAN** — brez njega se stranki
   ob izbiri avansa UPN blok ne prikaže.

## Kaj boš opazil po vklopu

Vsak zaposleni dobi svoj predal opravil (zvonček v vrstici); ti kot admin vidiš vsa.
Prva dva tedna pričakuj več opravil kot običajno — sistem izpisuje delo, ki se je
prej opravljalo »po spominu«. To je namen: nič več pregledovanja seznamov.
