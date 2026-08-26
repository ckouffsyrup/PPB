# PrintBook v4.2 — Real Mobile Push Setup

This update adds true Web Push notifications. On iPhone/iPad, Web Push works for a web app that has been added to the Home Screen and opened from that icon.

## 1. Update the database

Supabase → SQL Editor → New query.

Paste and run the new `supabase_schema.sql`.

It adds:
- `push_subscriptions`
- `push_notification_log`
- RLS policies for each user's devices

## 2. Generate push secrets

Open `push_setup/generate_push_secrets.html` locally on your PC and click **Generate push secrets**.

It generates:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `PUSH_CRON_SECRET`

Also choose:
- `VAPID_SUBJECT=mailto:YOUR_EMAIL@example.com`

The generator runs entirely in your browser.

**Never upload generated private keys or the cron secret to GitHub.**

## 3. Save the secrets in Supabase

Supabase → Edge Functions → Secrets.

Add:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `PUSH_CRON_SECRET`

## 4. Deploy the Edge Function

The function name must be exactly:

`push-notifications`

### Easiest: Supabase Dashboard

Supabase → Edge Functions → Deploy a new function → Via Editor.

Paste the code from:

`supabase/functions/push-notifications/index.ts`

Deploy it.

Turn **Verify JWT OFF** for this function. The function has its own protection for test requests and scheduled scans.

### CLI option

The included `supabase/config.toml` already contains:

```toml
[functions.push-notifications]
verify_jwt = false
```

Then deploy the function with the Supabase CLI.

## 5. Create the 15-minute background check

Open `push_setup/push_cron_template.sql`.

Replace:
- `YOUR_PROJECT_REF` with the project ref from your Supabase URL.
- `YOUR_PUSH_CRON_SECRET` with the exact cron secret you generated.

Run the edited SQL once in Supabase SQL Editor.

## 6. Update the GitHub Pages site

Replace:
- `index.html`
- `styles.css`
- `app.js`
- `sw.js`

Wait for GitHub Pages to deploy. The service worker cache is now `printbook-v4.2-push`.

## 7. Enable it on iPhone

1. Open PrintBook in Safari.
2. Share → **Add to Home Screen**.
3. Launch PrintBook from the Home Screen icon.
4. Sign into PrintBook.
5. Hamburger → Settings → Mobile Push Notifications.
6. Tap **Enable Mobile Push**.
7. Tap **Allow** on the iPhone prompt.
8. Tap **Send test push**.

If the test notification appears, the phone is registered.

## Background alerts in v4.2

The Supabase scheduler checks every 15 minutes for:
- filament at/below 100g or 15%
- products that are out of stock but still visible in the store
- orders due within 2 days
- orders due today
- overdue orders

A notification log prevents the exact same alert state from being sent every 15 minutes.

## Important iPhone detail

Normal Safari tabs do not get Web Push on iPhone. PrintBook must be installed to the Home Screen and launched from its Home Screen icon.
