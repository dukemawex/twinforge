'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, LoaderCircle, MailCheck } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TwinForgeLogo } from '@/components/twinforge-logo'

export function VerifyEmailForm({ email }: { email: string }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(60)
  const router = useRouter()

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || code.length !== 6) return
    setLoading(true)
    setError('')
    setNotice('')

    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp: code })
      if (result.error) {
        setError(result.error.message || 'That code is invalid or has expired.')
        return
      }
      router.replace('/app')
      router.refresh()
    } catch {
      setError('Unable to verify your email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function resend() {
    if (resending || cooldown > 0) return
    setResending(true)
    setError('')
    setNotice('')

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' })
      if (result.error) {
        setError(result.error.message || 'Unable to resend your code.')
        return
      }
      setCode('')
      setCooldown(60)
      setNotice('A new verification code was sent.')
    } catch {
      setError('Unable to resend your code. Please try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-8">
      <TwinForgeLogo />
      <Card className="surface-glow border bg-card/90">
        <CardHeader className="pb-3">
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-accent text-primary">
            <MailCheck aria-hidden="true" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Secure your studio</p>
          <CardTitle className="mt-3 text-3xl tracking-tight">Check your email</CardTitle>
          <CardDescription className="leading-relaxed">
            Enter the six-digit code sent to <span className="font-medium text-foreground">{email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={verify} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="verification-code">Verification code</Label>
              <Input
                id="verification-code"
                name="code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                disabled={loading}
                aria-invalid={Boolean(error)}
                className="h-12 text-center font-mono text-xl tracking-[.35em]"
              />
              <p className="text-xs text-muted-foreground">The code expires in 10 minutes.</p>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
            <Button size="lg" type="submit" disabled={loading || code.length !== 6}>
              {loading && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
              {loading ? 'Verifying' : 'Verify email'}
              {!loading && <ArrowRight data-icon="inline-end" />}
            </Button>
          </form>
          <div className="mt-6 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <Button variant="link" type="button" onClick={resend} disabled={resending || cooldown > 0}>
              {resending ? 'Sending code' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend verification code'}
            </Button>
            <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/sign-in">Use a different email</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
