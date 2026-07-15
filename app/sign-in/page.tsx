import Image from 'next/image'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { auth } from '@/lib/auth'

export default async function SignIn() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/app')

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <Image src="/marketing/shape-sphere.png" alt="" width={160} height={160} className="tf-blob left-[6%] top-[12%] hidden w-28 sm:block" aria-hidden />
      <Image src="/marketing/shape-torus.png" alt="" width={150} height={150} className="tf-blob bottom-[10%] right-[8%] hidden w-28 sm:block" aria-hidden />
      <AuthForm mode="sign-in" />
    </main>
  )
}
