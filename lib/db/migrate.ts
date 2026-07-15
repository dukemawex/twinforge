import { pool } from "./index"

// Idempotent schema bootstrap so auth works as soon as DATABASE_URL is set,
// without a separate migration step. Safe to run on every cold start.
const DDL = `
CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false, image text,
  "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS session (
  id text PRIMARY KEY, "expiresAt" timestamp NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
  "ipAddress" text, "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamp, "refreshTokenExpiresAt" timestamp,
  scope text, password text,
  "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS twins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" text NOT NULL, name text NOT NULL,
  status text NOT NULL DEFAULT 'draft', "referenceAssetId" uuid, "voiceAssetId" uuid,
  "externalTwinId" text, "consentRecordedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" text NOT NULL, kind text NOT NULL,
  pathname text NOT NULL, "contentType" text NOT NULL, size integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" text NOT NULL, "twinId" uuid,
  kind text NOT NULL DEFAULT 'video', status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0, stage text, "externalJobId" text, error text,
  payload jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" text NOT NULL, "jobId" uuid, "twinId" uuid,
  title text NOT NULL, status text NOT NULL DEFAULT 'processing', "outputAssetId" uuid,
  "externalUrl" text, "durationSeconds" integer, tags text[] NOT NULL DEFAULT '{}',
  "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);
`

let done = false
export async function ensureSchema() {
  if (done) return
  if (!process.env.DATABASE_URL) return
  await pool.query(DDL)
  done = true
}
