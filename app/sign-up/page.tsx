import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { IntelligentGeometry } from '@/components/intelligent-geometry'
import { auth } from '@/lib/auth'

export default async function SignUp() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user.emailVerified) redirect('/app')
  if (session?.user) redirect(`/verify-email?email=${encodeURIComponent(session.user.email)}`)

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <IntelligentGeometry variant="auth" />
      <div className="relative z-10 w-full">
        <AuthForm mode="sign-up" />
      </div>
    </main>
  )
}
