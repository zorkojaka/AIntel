# Offer Import Smoke Test

## Scope
Validate MVP feature "Uvozi ponudbo" in Projects > Offer phase.

## Preconditions
- Backend and module-projects are running.
- Cenik contains products/services with exact names used in paste.
- Open any project and navigate to Offer phase tab.

## Sample Paste (TSV)
Use this content in "Prilepi tabelo":

```tsv
Ajax Hub	9.5%	1
Ajax MotionProtect	9.5%	2
"Zagon in konfiguracija Ajax centrale
V sodelovanju z AlarmAutomatika"	9.5%	1
Potni stroski [km]*	9.5%	195
```

## Test Steps
1. In Offer phase, verify button `Uvozi ponudbo` is left of `Prenesi opise`.
2. Click `Uvozi ponudbo`.
3. Paste the sample table into `Prilepi tabelo`.
4. Click `Analiziraj tabelo`.
5. Verify preview rows appear with status chips (`Matched`, `Needs review`, `Invalid`).
6. For `Needs review`, choose a product in dropdown.
7. For `Invalid`, fix source line or click `Odstrani`.
8. Click `Uvozi v ponudbo`.
9. Verify modal closes and view scrolls to line items table.
10. Verify imported line items:
- `name` equals selected cenik item name.
- `quantity` equals pasted quantity.
- `unitPrice` equals cenik `prodajnaCena`.
- service items use unit `ura`, products use `kos`.
11. Edit any imported row and save offer to confirm normal flow still works.

## Color Variant Rule Test (WH/BL)
Precondition in cenik:
- `Ajax DoorProtect Plus WH`
- `Ajax DoorProtect Plus BL`

Paste this additional line:

```tsv
Ajax DoorProtect Plus\t9.5%\t14
```

Expected:
- Import auto-selects `Ajax DoorProtect Plus WH`.
- In `POST /api/offers/import/parse` response row, verify:
- `chosenProductId` points to WH item.
- `chosenReason` is `color_default_wh`.
- `matchScore` is high (typically >= `0.90`).

## Multi-line Service Similarity Test
Precondition in cenik:
- `Montaža in konfiguracija alarmne naprave v sodelovanju z AlarmAutomatika`

Paste this line:

```tsv
"Montaža in konfiguracija alarmne naprave
V sodelovanju z AlarmAutomatika"	9.5%	1
```

Expected:
- Row should not be `not_found`.
- Row is either:
- `Matched` with `chosenReason = token_best` and visible score, or
- `Needs review` with `chosenReason = token_needs_review` and preselected `chosenProductId`.
- Response includes `topCandidates` (up to 5) sorted by score.

## Prefix-First Matching Regression Cases
Add test lines that differ near the end of the name:

```tsv
Ajax DoorProtect Plus   WH	9.5%	2
Ajax DoorProtect Plus W	9.5%	2
Ajax DoorProtect Plus BL	9.5%	2
```

Expected:
- Extra spaces should still produce top candidate with high score (typically >= `0.60`).
- Missing last character near suffix should still suggest the same product at top (usually `Matched` or `Needs review` with preselected top).
- WH/BL variants should prefer WH when scores are nearly equal and input is ambiguous.
- Preview should show `reason + score` for each parsed row, and dropdown options should include candidate score.

## Expected Result
- Import populates offer line items from paste.
- `not_found` should be rare; unresolved rows are mostly `needs_review` with a preselected candidate.
- Rows show reason + score so operator can validate quick picks.
- Existing offer editor behavior remains functional after import.
