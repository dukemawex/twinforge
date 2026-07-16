import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { IntelligentGeometry } from '@/components/intelligent-geometry'
import { VerifyEmailForm } from '@/components/verify-email-form'

type VerifyEmailPageProps = {
  searchParams: Promise<{ email?: string }>
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user.emailVerified) redirect('/app')

  const { email } = await searchParams
  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) redirect('/sign-up')

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <IntelligentGeometry variant="auth" />
      <div className="relative z-10 w-full">
        <VerifyEmailForm email={normalizedEmail} />
      </div>
    </main>
  )
}
