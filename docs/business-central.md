# Avail AMZ PO

The detail table and full Excel export include Avail AMZ PO beside Availability Stock. The confirmation export and existing allocation rules are unchanged.

`GET /api/item-availabilities` reads the configured Business Central company using Microsoft Entra client credentials on the server. It follows OData pagination, requests level 1 and orders lineNo ascending. Secrets are never sent to the browser. The route is available through Vite dev middleware and a Vercel function. Use deployment access protection appropriate to the company data; the app currently has no user authentication.

Configure BC_CLIENT_ID and BC_CLIENT_SECRET in .env.local for development or the server's environment in Vercel. Configure BC_ITEM_FIELD, BC_DATE_FIELD and BC_STOCK_FIELD with the exact property names from the custom API response. The stock field must contain the resulting stock balance, not a movement quantity. These mappings deliberately have no guessed defaults.

Microsoft setup: https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/automation-apis-using-s2s-authentication

The lookup currently uses an exact match on the processed Amazon SKU (trimmed), filters level 1, sorts lineNo numerically, and takes the balance of the last line whose date is strictly before Win Start. Same-day movements are excluded. There is no suffix-based approximate matching or subtraction of other POs. Editing SKU or Win Start recalculates against the downloaded snapshot. Unknown articles or dates return N/A; a real zero remains zero. API failures show an error while leaving Excel processing available with N/A in the new column.

Live verification completed: authenticated against Business Central production API, confirmed field mappings (`itemNo`, `periodStart`, `projectedAvailableBalance`), and validated that article 19276 returns 758 before the 2026-09-14 delivery window start date.
