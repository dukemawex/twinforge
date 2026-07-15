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
      <span className="logo-stage" aria-hidden="true">
        <span className="logo-cube">
          <span className="logo-face logo-face-front">TF</span>
          <span className="logo-face logo-face-top" />
          <span className="logo-face logo-face-side" />
        </span>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-sans text-base font-bold tracking-[-0.04em] text-foreground">TwinForge</span>
          <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Human Video Studio</span>
        </span>
      )}
    </Link>
  )
}
