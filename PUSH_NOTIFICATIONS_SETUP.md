# PrintBook v5.2 - Reliable Order Push Setup

The new flow is:

Customer request -> `public-storefront` saves the order -> `push-notifications` sends a Web Push notification to every active device registered to your PrintBook account.

The notification does not depend on PrintBook being open, Supabase Realtime running, or the phone polling for orders.

## 1. Run the push subscription SQL once

Supabase -> SQL Editor -> New query.

Paste and run:

`supabase/migrations/v5_2_push_subscriptions.sql`

"Success. No rows returned" is normal.

## 2. VAPID keys

If you ALREADY configured VAPID keys during our earlier push-notification attempts, REUSE THE SAME `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` if possible. Changing the VAPID key pair means existing iPhone subscriptions need to be repaired/re-enabled.

If you do not have keys, on a PC with Node/npm installed run:

```powershell
npx web-push generate-vapid-keys
```

It prints a Public Key and Private Key. Do not put the private key in GitHub or the website files.

## 3. Add Supabase Edge Function secrets

Supabase -> Edge Functions -> Secrets.

Create/verify these project secrets:

- `VAPID_PUBLIC_KEY` = your generated public VAPID key
- `VAPID_PRIVATE_KEY` = your generated private VAPID key
- `VAPID_SUBJECT` = a contact URI, for example `mailto:you@example.com`
- `PUSH_INTERNAL_SECRET` = a long random secret shared only by the two Edge Functions
- `SHOP_OWNER_USER_ID` = your existing PrintBook account UUID (already used by public-storefront)

To generate `PUSH_INTERNAL_SECRET` in Windows PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Copy the output into the Supabase secret. Do not add it to `app.js`.

## 4. Deploy `push-notifications`

Create/redeploy an Edge Function named exactly:

`push-notifications`

Use:

`supabase/functions/push-notifications/index.ts`

Turn **Verify JWT OFF** for this function. The function performs its own authentication: test pushes validate your Supabase login token, while automatic order notifications require the private `PUSH_INTERNAL_SECRET` header.

## 5. Redeploy `public-storefront`

Redeploy:

`supabase/functions/public-storefront/index.ts`

It now calls `push-notifications` after an order has been successfully inserted. Push failure never deletes/rejects the order; it is logged separately.

## 6. Deploy the website files

Replace:

- `index.html`
- `styles.css`
- `app.js`
- `sw.js`

## 7. Repair/enable push on iPhone

1. Make sure PrintBook is installed to the iPhone Home Screen.
2. Open PrintBook from the Home Screen icon.
3. Sign into the owner/admin PrintBook account.
4. Settings -> Mobile Push Notifications.
5. The diagnostics should show:
   - Permission: Granted
   - Home Screen: Installed
   - Service worker: Ready
   - Browser subscription: Present
   - Cloud registration: Registered
   - Push backend: Ready
6. If anything says Needs Repair/Missing, tap **Repair Push Registration** / **Enable Mobile Push**.
7. Tap **Send test push** and lock/leave the app to verify background delivery.

If you changed VAPID keys, the new client detects the key mismatch and rebuilds the browser subscription.

## 8. Test a real customer request

Open the public storefront from another browser/device and submit a print request.

Expected server logs:

- `Public request created <order id>`
- `Order push delivered { ... sent: 1 }`

Your iPhone should receive:

**New Print Request**

`Customer requested 1× Product`

Tapping it opens PrintBook's Custom Orders page.

## Useful health endpoint

Open:

`https://dljauobtomijmtaxvkvv.supabase.co/functions/v1/push-notifications?health=1`

It does not reveal private keys. `configured.ready` should be `true`.
