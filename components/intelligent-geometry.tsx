import Image from 'next/image'
import { cn } from '@/lib/utils'

type IntelligentGeometryProps = {
  className?: string
  variant?: 'app' | 'auth' | 'section'
  density?: 'balanced' | 'compact'
}

const assets = [
  '/marketing/shape-cube.png',
  '/marketing/shape-sphere.png',
  '/marketing/shape-torus.png',
]

export function IntelligentGeometry({
  className,
  variant = 'section',
  density = 'balanced',
}: IntelligentGeometryProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('intelligent-geometry', `intelligent-geometry--${variant}`, className)}
    >
      {assets.map((src, index) => (
        <Image
          key={src}
          src={src}
          alt=""
          width={180}
          height={180}
          className={cn('intelligent-shape', `intelligent-shape--${index + 1}`, density === 'compact' && index === 2 && 'hidden sm:block')}
          priority={variant === 'auth'}
        />
      ))}
      <div className="intelligent-node-map">
        <span className="intelligent-node intelligent-node--1" />
        <span className="intelligent-node intelligent-node--2" />
        <span className="intelligent-node intelligent-node--3" />
        <span className="intelligent-node intelligent-node--4" />
        <span className="intelligent-link intelligent-link--1" />
        <span className="intelligent-link intelligent-link--2" />
        <span className="intelligent-link intelligent-link--3" />
      </div>
    </div>
  )
}
