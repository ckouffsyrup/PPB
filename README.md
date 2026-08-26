# PrintBook v3

Mobile-first 3D print pricing, inventory, sales, and custom-order tracker.

## Added in this version

- Filament inventory
  - brand, material, color, spool size, price, remaining grams
  - automatic cost-per-gram
  - low-filament dashboard section
- Multiple filaments per print
  - select multiple saved spools
  - grams per color/material
  - automatic material-cost calculation
- Print inventory
  - quantity made
  - quantity sold
  - current stock
- Sales history
  - quantity, sale price, date, channel, profit estimate
  - recording a sale automatically increases sold quantity
- Pricing presets
  - Normal, Friend, Event/Market, Bulk defaults
  - create/edit/delete your own presets
- Dashboard
  - revenue
  - estimated profit
  - stock
  - open orders
  - favorites
  - recent sales
  - low filament
  - active orders
- Favorites
- Model source URL
- Custom orders
  - customer, request, quantity, quote, status, due date, linked print, notes
- “Help Me Price This”
  - print time
  - multiple filament usage
  - post-processing cost
  - complexity
  - preset
  - recommended, high-margin, and bulk price
  - one tap to turn the quote into a new print

## Updating the GitHub Pages site

Replace the old repository files with the contents of this zip and commit them.

Important: `sw.js` now uses a new cache version so the updated site should replace the old app after refresh.

## Local mode

Everything except cross-device sync works without Supabase. Data is saved in the browser and can be exported as JSON.

## Supabase sync

When you're ready:

1. Open Supabase SQL Editor.
2. Run the included `supabase_schema.sql`.
   - It is migration-friendly and can be run over the earlier PrintBook schema.
3. Copy Project URL + anon/public key into PrintBook → Settings.
4. Create account / sign in.
5. Use “Upload local data” once to push your existing local prints, filaments, sales, and orders.

Pricing presets are currently stored in local settings rather than Supabase because they're tiny configuration data. Your catalog, filaments, sales, orders, and print photos sync through Supabase.

## Pricing logic

For the selected preset:

`base = material cost + (hours × printer hourly rate)`

`recommended = base × markup × complexity`

Then PrintBook applies the preset minimum and rounds upward.

Material cost comes from the selected saved filament spools and grams used, plus any manual extra cost.
