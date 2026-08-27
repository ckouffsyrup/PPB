# PrintBook v4 — Store + Production Update

## New features

- Customer Store Mode
  - clean product catalog
  - hides admin/profit controls
  - product detail view
  - shows variants, availability, and deals
- Product variants
  - per-variant price
  - per-variant stock
  - optional saved colorway
- Colorway presets
  - reusable combinations of saved filament spools + grams
- Automatic filament deduction
  - use **Make / Restock**
  - choose variant and quantity
  - PrintBook deducts the required grams from each spool
- Filament check before printing
  - production is blocked if a required spool does not have enough filament
- Restock suggestions
  - low spools show estimated average prints remaining
  - dashboard surfaces what to buy soon
- Discounts
  - product deals such as “2 for $18”
  - sale-level percent or flat discounts
- Out-of-stock behavior
  - show an OUT OF STOCK card or hide the product from Home / Customer Store
- Better syncing
  - visible Syncing / Synced / Offline / Error states
  - last-sync time
  - Supabase Realtime refresh between signed-in devices
  - cloud-empty protection so a first login does not wipe local data
- Notifications
  - in-app notification center
  - low filament / restock warnings
  - out-of-stock alerts
  - due / overdue custom orders
  - sync problems and offline state
  - optional browser notification permission while the site is open

## IMPORTANT: Supabase migration

Because your Supabase database is already connected, you MUST run the new `supabase_schema.sql`.

1. Supabase → SQL Editor
2. New query
3. Paste the complete new `supabase_schema.sql`
4. Run it

It adds the new variant, discount, sync, and colorway fields/tables while keeping existing data.

## GitHub Pages update

Replace only these changed files in your repository:

- `index.html`
- `styles.css`
- `app.js`
- `sw.js`
- `supabase_schema.sql`

The service-worker cache is bumped to `printbook-v4`.

## Production workflow

1. Save filament spools.
2. Save a colorway if you commonly use the same combination.
3. Add variants to a product and attach colorways.
4. Open the product → **Make / Restock**.
5. Choose variant + quantity.
6. PrintBook checks every required spool.
7. If enough filament exists, confirming the batch deducts the grams and increases stock.
8. Record a sale to reduce stock and add revenue/profit history.

## Notification limitation

The in-app notification center always works when you open PrintBook.
Standard browser notifications in this version are local alerts while PrintBook is open. True background push notifications would require a push service / backend job later
