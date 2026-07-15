import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { LogoWatermark } from '@/components/logo-watermark'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: { default: 'TwinForge — AI Human Video Studio', template: '%s | TwinForge' },
  description: 'Train a digital twin from one short clip and turn any script into vertical, caption-ready video for Reels and TikTok.',
}
export const viewport: Viewport = { themeColor: '#ffffff', colorScheme: 'light', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="bg-background"><body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}><LogoWatermark />{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}
