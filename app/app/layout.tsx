import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
export default async function WorkspaceLayout({children}:{children:React.ReactNode}){const s=await auth.api.getSession({headers:await headers()});if(!s?.user)redirect("/sign-in");return <AppShell name={s.user.name}>{children}</AppShell>}
