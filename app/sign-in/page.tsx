import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { auth } from '@/lib/auth'

export default async function SignIn() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/app')

  return <main className="studio-grid flex min-h-screen items-center justify-center px-4 py-12"><AuthForm mode="sign-in" /></main>
}
