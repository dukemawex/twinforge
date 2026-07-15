import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: { default: 'TwinForge — AI Human Video Studio', template: '%s | TwinForge' },
  description: 'Create expressive digital twins and produce human video at studio scale.',
}
export const viewport: Viewport = { themeColor: '#17171d', colorScheme: 'dark', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="dark bg-background"><body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}
