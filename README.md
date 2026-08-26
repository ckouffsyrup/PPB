# PrintBook

A phone-first 3D-print pricing book that can run on GitHub Pages.

## What it does

- Save a photo for each print
- Track selling price, print time, material cost, filament weight, colors/material, category and notes
- Automatically suggest a price
- Estimate profit
- Search and filter
- Works offline in local mode
- Optional Supabase account + cloud sync
- Installable on iPhone/Android as a home-screen web app
- JSON backup/export

The first sample entry is the small multicolor figure priced at $10.

## Quick local test

Open `index.html` in a browser. Local mode works immediately.

For the installable/offline PWA features, use GitHub Pages or another web server rather than opening the file directly.

## Put it on GitHub Pages

1. Create a new GitHub repository, for example `printbook`.
2. Upload the contents of this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`.
6. Save. GitHub will give you the site address.

## Add it to iPhone Home Screen

1. Open the GitHub Pages site in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Name it `PrintBook`.

It will launch much more like a normal app.

## Optional cloud sync with Supabase

Local mode works without this. Cloud sync is what makes the same price book appear on your phone and PC.

1. Create a free Supabase project.
2. Open **SQL Editor**.
3. Paste and run `supabase_schema.sql`.
4. In Supabase, open **Project Settings → API**.
5. Copy the **Project URL** and **anon/public key**.
6. Open PrintBook → Settings.
7. Paste the URL and anon key.
8. Create an account with your email/password or sign in.
9. Tap **Upload local prints** once if you already added prints before enabling sync.

The anon key is intended for browser apps. The included Row Level Security rules prevent users from reading each other's print records.

### Authentication note

If Supabase email confirmation is enabled, you may need to confirm the email before signing in. For a private personal app, you can change this in Supabase Authentication settings if desired.

## Pricing formula

Suggested price is:

`(material cost + print hours × printer hourly rate) × profit multiplier`

Then it applies your minimum price and rounds up by your chosen amount.

Defaults:
- Printer time: $2/hour
- Profit multiplier: 1.5×
- Minimum price: $8
- Round to: $1

Change these inside Settings.
