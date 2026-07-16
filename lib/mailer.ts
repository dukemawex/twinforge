import nodemailer from "nodemailer"

const user = process.env.GMAIL_USER
const pass = process.env.GMAIL_APP_PASSWORD

export const mailerConfigured = Boolean(user && pass)

const transporter = mailerConfigured
  ? nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 30_000,
    })
  : null

export async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) throw new Error('Gmail SMTP credentials are not configured.')
  await transporter.sendMail({ from: `TwinForge <${user}>`, to, subject, html })
}

export function verificationCodeEmailHtml(code: string) {
  return `<div style="background:#f8f6fc;padding:32px 16px;font-family:Arial,sans-serif;color:#17141f">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6dfef;border-radius:16px;padding:32px">
      <p style="margin:0 0 18px;color:#6d28d9;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">TwinForge verification</p>
      <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25">Confirm your email</h1>
      <p style="margin:0 0 24px;color:#665f70;line-height:1.6">Enter this six-digit code to activate your studio. The code expires in 10 minutes.</p>
      <div style="margin:0 0 24px;border-radius:12px;background:#f2ecfa;padding:18px;text-align:center;color:#5b21b6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:.28em">${code}</div>
      <p style="margin:0;color:#82798d;font-size:13px;line-height:1.5">If you did not create a TwinForge account, you can safely ignore this email.</p>
    </div>
  </div>`
}

export function passwordResetCodeEmailHtml(code: string) {
  return `<div style="background:#f8f6fc;padding:32px 16px;font-family:Arial,sans-serif;color:#17141f">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6dfef;border-radius:16px;padding:32px">
      <p style="margin:0 0 18px;color:#6d28d9;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">TwinForge recovery</p>
      <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25">Reset your password</h1>
      <p style="margin:0 0 24px;color:#665f70;line-height:1.6">Enter this six-digit code to choose a new password. The code expires in 10 minutes.</p>
      <div style="margin:0 0 24px;border-radius:12px;background:#f2ecfa;padding:18px;text-align:center;color:#5b21b6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:.28em">${code}</div>
      <p style="margin:0;color:#82798d;font-size:13px;line-height:1.5">If you did not request a password reset, you can safely ignore this email.</p>
    </div>
  </div>`
}
