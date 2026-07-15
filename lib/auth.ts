import { betterAuth } from "better-auth"
import { Pool } from "pg"
import { sendMail, resetEmailHtml, mailerConfigured } from "./mailer"

const urls = [process.env.BETTER_AUTH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`, process.env.V0_RUNTIME_URL].filter(Boolean) as string[]

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: urls[0],
  trustedOrigins: urls,
  emailAndPassword: {
    enabled: true,
    // Password reset via Gmail SMTP (Nodemailer). No-op if GMAIL creds absent.
    sendResetPassword: mailerConfigured
      ? async ({ user, url }) => { await sendMail(user.email, "Reset your TwinForge password", resetEmailHtml(url)) }
      : undefined,
  },
  advanced: process.env.NODE_ENV === "development" ? { defaultCookieAttributes: { sameSite: "none", secure: true } } : undefined,
})
