# Audiobook Viewer

A personal audiobook player. Your **library, chapter index, listening position,
bookmarks and cover art** live in Supabase and sync across devices. Your
**audio files never leave your machine** — the app reads them straight off disk
through the browser's File System Access API.

Chrome or Edge on desktop only. Safari and Firefox do not implement the folder
access this depends on.

## Deploying

Every push to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Live at **https://parthjain.ca/AudioBookViewer/** — the account has a custom
domain, so it is not the usual `github.io` URL.

The workflow needs two repository secrets, already set:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Both are publishable — the
anon key is designed to reach the browser, and row-level security rather than
secrecy is what protects the data. They live in secrets only to stay out of the
git history.

### Sign-in must be told about the deployed URL

Auth will fail on the live site until Supabase knows about it. In
**Authentication → URL Configuration** add:

- *Site URL*: `https://parthjain.ca/AudioBookViewer/`
- *Redirect URLs*: `https://parthjain.ca/AudioBookViewer/**` and
  `http://localhost:5173/**` so local development keeps working

Google Cloud Console needs no change — its authorized redirect URI is still the
Supabase callback, which is unchanged.

The app asks for the base path explicitly (`import.meta.env.BASE_URL`) when
redirecting, because `window.location.origin` alone would drop the `/AudioBookViewer/`
prefix and land on the domain root.
