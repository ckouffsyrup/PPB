# PrintBook v4.4 — Public Synced Storefront

This version makes the normal GitHub Pages URL a live, read-only customer storefront for anyone who is not already signed into the PrintBook admin account.

## One-time Supabase setup

1. Go to Supabase -> Authentication -> Users.
2. Open your PrintBook admin account and copy its User ID / UUID.
3. Go to Edge Functions -> Secrets.
4. Add:
   SHOP_OWNER_USER_ID = YOUR_USER_UUID
5. Create a new Edge Function named exactly:
   public-storefront
6. Paste `supabase/functions/public-storefront/index.ts`.
7. Deploy it.
8. Turn Verify JWT OFF for `public-storefront`.

Then upload the changed GitHub Pages files.

## What public visitors can see

- products
- selling prices
- product variants and available stock
- customer-facing notes/photos
- available filament color, brand, and material
- whether a filament is low stock

They do NOT receive filament purchase cost, cost per gram, profit, sales, admin settings, order history, auth information, or other private fields.

## Public print requests

"Request This Print" now posts to the Edge Function and creates a real `Requested` custom order in your admin account. The server validates the selected product/variant/filament before creating the order.

## Admin behavior

A device that already has your Supabase admin session restored opens the normal admin interface. Signing out switches that device back to the public storefront.

The public storefront never writes its synced catalog into the visitor's local admin data.
