import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  if (!session.user.emailVerified) redirect(`/verify-email?email=${encodeURIComponent(session.user.email)}`)
  return <AppShell name={session.user.name}>{children}</AppShell>
}
