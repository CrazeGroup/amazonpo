# UK PO import audit

Audited input: `Po UK.xls` (7 September 2026). The binary Excel file contains `Line Items`, `Instructions`, and `Reference Data`. Only `Line Items` is imported; document instructions are treated as file content, not application commands.

The supplied sample has 57 lines across 3 POs (1WSV8ROO, 16592KHG, 19Z7PVHK), 4,705 requested units and GBP 19,263.02 in requested cost. All lines are Unconfirmed. Merchant SKU is blank, so the product identifier must come from Model number. Case size is 1; allocation still uses the separate Outer configuration, as for existing regions.

| UK column | Application field |
| --- | --- |
| PO | PO Number |
| Vendor code | Vendor Code |
| Ship-to location | Destination Warehouse |
| External ID type | Code Type |
| External ID | EAN Code |
| Model number | Amazon SKU |
| Product name | Product Title |
| Availability | Availability Status |
| Requested quantity | Quantity Requested |
| Accepted quantity | Expected Quantity (recalculated during allocation) |
| Cost | Unit Cost |
| Window start / Window end | Delivery Window Start / End Date |
| Expected date | Estimated Delivery Date (set to window end by existing allocation rules) |
| Currency | Currency |

Header matching ignores case and extra whitespace. UK GBP text values accept decimal dots and comma thousands separators; numeric Excel cells stay numeric. Legacy European number handling is retained. PO imports validate required columns and missing required values. Configuration imports preserve a literal SKU column.

Upload through the existing UK file slot alongside Availability, Tags and Outer, then Process. UK can be processed alone or together with DE/EU; existing shared sequential stock allocation and EN SKU preference apply. Details and full export include region and currency. The pivot selects one currency at a time to avoid adding GBP and EUR. There is no exchange-rate conversion. The regional confirmation export retains the existing five-column contract and filters UK rows.

Validation: automated XLS binary import, legacy DE/EU parsing, configuration SKU lookup, required-field errors, shared stock allocation, full/confirmation export round trips, pivot rendering and the supplied workbook's counts/totals. The sample's allocation test uses synthetic sufficient stock and Outer/Tags fixtures; actual accepted quantities depend on uploaded configuration. Vendor Central submission was not performed.

Run `npm test`. To include the local source workbook audit:

```sh
PO_UK_FILE='/Users/christianvidalwolf/Downloads/Po UK.xls' npm test
```

## Bulk upload

The shared drop zone accepts multiple `.xls` / `.xlsx` files in one drop or file-picker selection. It proposes Availability, Tags and Outer assignments from their columns. PO region detection uses a region token in the filename (DE, EU/ES/FR/IT, UK/GB) or GBP currency for UK; EUR alone cannot distinguish DE from EU. Review the assignments, choose any unresolved regions, then use Assign files before processing. Unassigned or unreadable files are skipped with a visible count, duplicate destinations block assignment, and selected destinations replace the files currently in those slots. Individual upload controls remain available.
