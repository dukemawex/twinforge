'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

type TwinForgeLogoProps = {
  className?: string
  compact?: boolean
  href?: string
}

export function TwinForgeLogo({ className, compact = false, href = '/' }: TwinForgeLogoProps) {
  return (
    <Link href={href} className={cn('group inline-flex items-center gap-3', className)} aria-label="TwinForge home">
      <span className="relative flex size-10 items-center justify-center overflow-hidden rounded-xl border border-primary/30 bg-primary/10 shadow-[inset_0_0_0_1px_var(--color-border)] transition-colors group-hover:bg-primary/15">
        <span className="absolute inset-1.5 rotate-45 rounded-sm border border-primary/55" />
        <span className="relative font-mono text-sm font-bold tracking-tighter text-primary">TF</span>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-sans text-base font-semibold tracking-[-0.03em] text-foreground">TwinForge</span>
          <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground">Human Video Studio</span>
        </span>
      )}
    </Link>
  )
}
