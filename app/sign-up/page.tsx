import Image from 'next/image'
import { AuthForm } from '@/components/auth-form'
export default function SignUp() {
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
    <Image src="/marketing/shape-cube.png" alt="" width={160} height={160} className="tf-blob left-[7%] top-[14%] hidden w-28 sm:block" aria-hidden />
    <Image src="/marketing/avatar-1.png" alt="" width={240} height={240} className="tf-blob bottom-[6%] right-[5%] hidden w-40 sm:block" aria-hidden />
    <AuthForm mode="sign-up" />
  </main>
}
