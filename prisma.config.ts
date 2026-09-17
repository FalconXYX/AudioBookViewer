import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 reads connection details from here rather than from the datasource
 * block in schema.prisma, and no longer loads .env automatically.
 *
 * DATABASE_URL must be the DIRECT connection (Supabase: port 5432, "Direct
 * connection" or "Session pooler"), not the transaction pooler — migrations
 * need a session-level connection.
 *
 * It contains your database password, lives in .env, and is only ever used
 * from your own machine at migration time. It is never bundled into the app:
 * the browser talks to Supabase's REST API with the anon key instead.
 */
try {
  process.loadEnvFile('.env')
} catch {
  // .env is optional — `prisma generate` needs no database connection.
}

const url = process.env.DATABASE_URL

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Omitted entirely when unset, so `generate` works on a fresh clone and
  // migration commands fail with Prisma's own clear "datasource required".
  ...(url ? { datasource: { url } } : {}),
})
