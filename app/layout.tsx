import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
const sans=Geist({subsets:["latin"],variable:"--font-geist-sans"});const mono=Geist_Mono({subsets:["latin"],variable:"--font-geist-mono"})
export const metadata:Metadata={title:{default:"TwinForge — Digital Human Studio",template:"%s | TwinForge"},description:"Create consent-first digital twins and production-ready AI video."}
export const viewport:Viewport={themeColor:"#090a0d",colorScheme:"dark",width:"device-width",initialScale:1,userScalable:true}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className="dark bg-background"><body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>{children}{process.env.NODE_ENV==="production"&&<Analytics/>}</body></html>}
