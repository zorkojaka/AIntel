# Projektna koordinacija: asinhrono sodelovanje AI agentov

## Cilj
Vzpostaviti transparenten register, kjer lahko več agentov hkrati deluje na lastnih modulih, jasno deli začete in končane korake ter ohranja centralni načrt, da lahko vsakdo kadarkoli nadaljuje ali prilagodi sistem.

## Asinhrona komunikacija
- Vsak agent v docs/KOORDINACIJA.md vodi svojo kratko sekcijo z naslovom ### Agent <ime> – <modul>. Tam zapiše:
  1. **Začetne naloge** (kaj je prevzel, kateri dokumenti so osnova).
  2. **Izvedeni koraki** (kateri moduli/rute/sheme so dodani, kje so testi).
  3. **Naslednji koraki** (kaj še ostane, kateri agent lahko nadaljuje).
- Dokument služi kot komentiran dnevnik – obvestila so v slovenščini, ključi v angleščini. Vsaka sekcija navede tudi referenco na docs/faze/<faza>-<modul>.md ali modules/<modul>/README.md, kjer so podrobna navodila.
- Če agent prejme ločen nabor navodil za modul (če že obstaja docs/faze/ datoteka), naj v sekciji zapiše, kje je kopija shranjena, da se drugi agenti ne podvajajo.

## Modulni register in navodila
- Vsak modul ima svoje gradnike: controllers/, 
outes/, schemas/ in dokument modules/<modul>/README.md, kjer so opisani API-ji, potrebni modeli, migracije in morebitne dashboard integracije.
- Poleg tega za vsako fazo obstaja datoteka v docs/faze/, kjer so zabeležni koraki, testni primeri in zahtevani podatki – vključite povezave do teh dokumentov v docs/KOORDINACIJA.md, da agenti vedo, ali je navodilo že posodobljeno.
- Arhitekturo in načrt integracije posodabljamo v docs/ARHITEKTURA.md, kjer zabeležimo, kako modul povežemo z ackend/routes.ts, katere core/ helperje uporablja in kako se povežemo z ostalimi storitvami.

## GitHub in spremljanje faz
- Vsaka faza (npr. "CORE", "CRM", "Projekti") ali vmesni korak mora biti objavljena v repozitoriju https://github.com/zorkojaka/AIntel. Če ima faza več korakov, vsak pomemben mejnik dobi svoj commit in pripadajočo sled.
- Imena commitov se morajo ujemati z imenom faze in koraka (primer: CORE - osnovna struktura, FAZA1-CRM - kontakti, CRM - dashboard integracija). Tako je iz zgodovine git razvidno, kateremu delu faze pripada sprememba.
- Po vsakem pushu v repo v docs/KOORDINACIJA.md kratko označite, kje je commit in kakšna je povezava (npr. Commit: CORE - osnovna struktura (branch: faza0-core)).

## Prevzem modulov
- Če agent prevzame modul, naj v docs/KOORDINACIJA.md zapiše referenco: Modul: <ime>, Phase: <nova faza>, Start: <datum>, Status: in progress.
- Komunikacija poteka v dokumentih, ne v zasebnih kanalih – to omogoča sledljivost in jasen prehod nalogam.
- Vsak agent pred odhodom (ali pred koncem izmenljivih korakov) preveri docs/TODO.md, da označi dokončan status, in doda povzetke v docs/ARHITEKTURA.md ter docs/KOORDINACIJA.md.
