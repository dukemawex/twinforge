'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Boxes, Clapperboard, LayoutDashboard, Library, LogOut, Menu, Plus, Settings, Users, X } from 'lucide-react'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { TwinForgeLogo } from '@/components/twinforge-logo'
import { cn } from '@/lib/utils'

const navigation = [
  { href: '/app', label: 'Overview', icon: LayoutDashboard },
  { href: '/app/twins', label: 'Digital twins', icon: Users },
  { href: '/app/create', label: 'Create video', icon: Clapperboard },
  { href: '/app/batch', label: 'Batch studio', icon: Boxes },
  { href: '/app/library', label: 'Library', icon: Library },
]

export function AppShell({ children, name }: { children: React.ReactNode; name: string }) {
  const pathname = usePathname(); const router = useRouter(); const [open, setOpen] = useState(false)
  const signOut = async () => { await authClient.signOut(); router.push('/'); router.refresh() }
  const sidebar = <aside className="flex h-full flex-col bg-sidebar px-4 py-5">
    <div className="flex items-center justify-between px-1"><TwinForgeLogo href="/app" /><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X /></Button></div>
    <Button className="mt-8 w-full" render={<Link href="/app/create" onClick={() => setOpen(false)} />}><Plus data-icon="inline-start" />New production</Button>
    <nav className="mt-7 flex flex-col gap-1" aria-label="Workspace navigation">{navigation.map(({ href, label, icon: Icon }) => { const active = href === '/app' ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} onClick={() => setOpen(false)} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', active && 'bg-muted text-foreground')}><Icon className={cn('size-4', active && 'text-primary')} />{label}</Link> })}</nav>
    <div className="mt-auto flex flex-col gap-2 border-t pt-4">
      <Link href="/app/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="size-4" />Settings</Link>
      <div className="flex items-center gap-3 rounded-xl px-2 py-2"><Avatar className="size-8"><AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span><Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}><LogOut /></Button></div>
    </div>
  </aside>
  return <div className="min-h-screen bg-background"><div className="fixed inset-y-0 left-0 hidden w-64 border-r lg:block">{sidebar}</div>{open && <div className="fixed inset-0 bg-background/80 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}><div className="h-full w-72 border-r" onClick={event => event.stopPropagation()}>{sidebar}</div></div>}<div className="lg:pl-64"><header className="sticky top-0 flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></Button><p className="hidden font-mono text-[10px] uppercase tracking-[.22em] text-muted-foreground sm:block">Production workspace</p><div className="ml-auto flex items-center gap-2"><span className="size-2 rounded-full bg-accent" /><span className="font-mono text-xs text-muted-foreground">Ready</span></div></header><main className="mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:p-8">{children}</main></div></div>
}
