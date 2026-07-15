import { betterAuth } from "better-auth"
import { Pool } from "pg"
import { sendMail, resetEmailHtml, mailerConfigured } from "./mailer"

function siteURL() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: siteURL(),
  // Trust the deployed domain, preview URLs, and localhost so Set-Cookie is accepted.
  trustedOrigins: [
    siteURL(),
    "http://localhost:3000",
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    "https://twinforge-theta.vercel.app",
  ],
  emailAndPassword: {
    enabled: true,
    sendResetPassword: mailerConfigured
      ? async ({ user, url }) => { await sendMail(user.email, "Reset your TwinForge password", resetEmailHtml(url)) }
      : undefined,
  },
})
