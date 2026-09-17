#!/usr/bin/env node
/**
 * Decide, definitively, whether the Google client secret stored in Supabase
 * matches the client ID Supabase is actually using.
 *
 * Google's token endpoint distinguishes the two failure modes we care about:
 *
 *   invalid_client  -> the client_id/client_secret pair is wrong
 *   invalid_grant   -> the pair is FINE; only the (deliberately fake) code failed
 *
 * So we can test the credentials without a browser round trip and without a
 * real authorization code.
 *
 * Usage:
 *   GOOGLE_CLIENT_SECRET='paste-it-here' node scripts/check-google-oauth.mjs
 *
 * The secret is read from the environment, never written to disk and never
 * printed. Delete this file once sign-in works.
 */
process.loadEnvFile(new URL('../.env.local', import.meta.url).pathname)

const base = process.env.VITE_SUPABASE_URL
const secret = process.env.GOOGLE_CLIENT_SECRET

if (!base) {
  console.error('VITE_SUPABASE_URL missing from .env.local')
  process.exit(1)
}
if (!secret) {
  console.error("Set GOOGLE_CLIENT_SECRET. Example:\n  GOOGLE_CLIENT_SECRET='...' node scripts/check-google-oauth.mjs")
  process.exit(1)
}

// Ask Supabase what it sends to Google, so we test the real stored client_id.
const authorize = await fetch(`${base}/auth/v1/authorize?provider=google`, { redirect: 'manual' })
const location = authorize.headers.get('location')
if (!location) {
  console.error('Supabase did not redirect to Google. Is the provider enabled?')
  process.exit(1)
}
const params = new URL(location).searchParams
const clientId = params.get('client_id')
const redirectUri = params.get('redirect_uri')

console.log('client_id   :', clientId)
console.log('redirect_uri:', redirectUri)
console.log('secret      : supplied, %d chars (not shown)', secret.length)
if (secret !== secret.trim()) console.log('  WARNING: the value has leading/trailing whitespace')
console.log()

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: 'deliberately-invalid-code',
    client_id: clientId,
    client_secret: secret,
    redirect_uri: redirectUri,
  }),
})
const body = await res.json().catch(() => ({}))

console.log('Google responded:', res.status, body.error ?? '')
if (body.error_description) console.log('  ', body.error_description)
console.log()

switch (body.error) {
  case 'invalid_grant':
    console.log('VERDICT: the client ID and secret MATCH.')
    console.log('Only the fake code was rejected, which is expected.')
    console.log('The secret is not your problem — look elsewhere.')
    break
  case 'invalid_client':
    console.log('VERDICT: the secret does NOT belong to this client ID.')
    console.log('In Google Cloud Console open the client whose ID is exactly')
    console.log(`  ${clientId}`)
    console.log('and create the secret there. A secret from any other OAuth client fails this way.')
    break
  default:
    console.log('VERDICT: unexpected response, see above.')
}
