import nodemailer from "nodemailer"

const user = process.env.GMAIL_USER
const pass = process.env.GMAIL_APP_PASSWORD

export const mailerConfigured = Boolean(user && pass)

const transporter = mailerConfigured
  ? nodemailer.createTransport({ host: "smtp.gmail.com", port: 587, secure: false, auth: { user, pass } })
  : null

export async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) { console.warn("[mailer] GMAIL not configured; skipping email to", to); return }
  await transporter.sendMail({ from: `TwinForge <${user}>`, to, subject, html })
}

export function resetEmailHtml(url: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#111">
    <h2 style="color:#7c3aed">TwinForge</h2>
    <p>We received a request to reset your password.</p>
    <p><a href="${url}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>
    <p style="color:#888;font-size:12px">If you didn't request this, ignore this email.</p></div>`
}
