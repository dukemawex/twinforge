import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import { mailerConfigured, resetEmailHtml, sendMail } from '@/lib/mailer'

function normalizeUrl(value?: string) {
  if (!value) return undefined
  return value.startsWith('http') ? value : `https://${value}`
}

const baseURL =
  normalizeUrl(process.env.BETTER_AUTH_URL) ??
  normalizeUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  normalizeUrl(process.env.VERCEL_URL) ??
  normalizeUrl(process.env.V0_RUNTIME_URL) ??
  'http://localhost:3000'

const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_URL,
  process.env.V0_RUNTIME_URL,
  'https://twinforge-theta.vercel.app',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
]
  .map(normalizeUrl)
  .filter((url): url is string => Boolean(url))

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    sendResetPassword: mailerConfigured
      ? async ({ user, url }) => {
          await sendMail(user.email, 'Reset your TwinForge password', resetEmailHtml(url))
        }
      : undefined,
  },
  advanced:
    process.env.NODE_ENV === 'development'
      ? { defaultCookieAttributes: { sameSite: 'none', secure: true } }
      : undefined,
})
