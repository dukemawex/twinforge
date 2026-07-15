'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TwinForgeLogo } from '@/components/twinforge-logo'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const router = useRouter()
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(''); const form = new FormData(event.currentTarget); const email = String(form.get('email')); const password = String(form.get('password')); const name = String(form.get('name') || email.split('@')[0]); const result = mode === 'sign-up' ? await authClient.signUp.email({ email, password, name }) : await authClient.signIn.email({ email, password }); if (result.error) { setError(result.error.message || 'Unable to continue'); setLoading(false); return } router.push('/app'); router.refresh() }
  return <div className="flex w-full max-w-md flex-col gap-8"><TwinForgeLogo /><Card className="surface-glow border bg-card/90"><CardHeader className="pb-3"><p className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">{mode === 'sign-up' ? 'Create workspace' : 'Studio access'}</p><CardTitle className="mt-3 text-3xl tracking-tight">{mode === 'sign-up' ? 'Start your studio' : 'Welcome back'}</CardTitle><CardDescription className="leading-relaxed">{mode === 'sign-up' ? 'Build your first digital twin and prepare your production workspace.' : 'Sign in to continue creating with TwinForge.'}</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-5">{mode === 'sign-up' && <div className="flex flex-col gap-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" autoComplete="name" required /></div>}<div className="flex flex-col gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div><div className="flex flex-col gap-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} minLength={8} required /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button size="lg" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}{loading ? 'Please wait' : mode === 'sign-up' ? 'Create account' : 'Enter studio'}{!loading && <ArrowRight data-icon="inline-end" />}</Button></form><p className="mt-6 text-center text-sm text-muted-foreground">{mode === 'sign-up' ? 'Already have a workspace?' : 'New to TwinForge?'} <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={mode === 'sign-up' ? '/sign-in' : '/sign-up'}>{mode === 'sign-up' ? 'Sign in' : 'Create one'}</Link></p></CardContent></Card></div>
}
