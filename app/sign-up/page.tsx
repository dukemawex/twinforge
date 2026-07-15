import Link from "next/link"
import { AuthForm } from "@/components/auth-form"
export default function SignUp(){return <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4"><Link href="/" className="font-semibold">TwinForge/</Link><AuthForm mode="sign-up"/><p className="text-sm text-muted-foreground">Already have an account? <Link href="/sign-in" className="text-primary">Sign in</Link></p></main>}
