import Link from "next/link"
import { AuthForm } from "@/components/auth-form"
export default function SignIn(){return <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4"><Link href="/" className="font-semibold">TwinForge/</Link><AuthForm mode="sign-in"/><p className="text-sm text-muted-foreground">New here? <Link href="/sign-up" className="text-primary">Create an account</Link></p></main>}
