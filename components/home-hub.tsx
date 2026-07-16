'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight, Boxes, Camera, Clapperboard, GraduationCap, Image as ImageIcon, Library, Sparkles, Users, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

const tiles = [
  { href: '/app/twins/new', title: 'Create an avatar', desc: 'Record a short clip and prepare a studio-ready digital twin.', icon: Users, tone: 'bg-primary/10 text-primary' },
  { href: '/app/create', title: 'Script to video', desc: 'Turn any script into a caption-ready avatar video.', icon: Clapperboard, tone: 'bg-[oklch(0.72_0.14_200/.14)] text-[oklch(0.5_0.14_200)]' },
  { href: '/app/photo', title: 'Photo to video', desc: 'One photo, unlimited looks — speak from a single still.', icon: ImageIcon, tone: 'bg-[oklch(0.7_0.16_25/.14)] text-[oklch(0.55_0.18_25)]' },
  { href: '/app/create?preset=lesson', title: 'Course lesson', desc: 'Build a structured lesson video from an outline.', icon: GraduationCap, tone: 'bg-[oklch(0.75_0.15_90/.16)] text-[oklch(0.5_0.13_90)]' },
  { href: '/app/batch', title: 'Batch studio', desc: 'Prepare dozens of videos from one CSV in a single pass.', icon: Boxes, tone: 'bg-primary/10 text-primary' },
  { href: '/app/library', title: 'Library', desc: 'Every prepared production and finished video in one place.', icon: Library, tone: 'bg-muted text-foreground' },
]

export function HomeHub({ name }: { name: string }) {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const go = () => router.push(`/app/create${prompt.trim() ? `?prompt=${encodeURIComponent(prompt.trim())}` : ''}`)
  return <div className="flex flex-col gap-9">
    <section className="relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-9">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="tf-chip"><Sparkles className="size-3.5" />All-in-one video agent</span>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">Say it with video</h1>
        <p className="mt-3 text-muted-foreground">Ask for a video, an avatar, or anything in between — {name.split(' ')[0]}, describe it and we prepare the whole brief.</p>
        <div className="mt-7 w-full rounded-2xl border bg-background p-3 text-left shadow-sm">
          <div className="mb-2 flex flex-wrap gap-2">
            {['Auto avatar','Auto voice','Auto brand'].map(c=><span key={c} className="tf-chip !bg-muted !text-muted-foreground">{c}</span>)}
          </div>
          <Textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} placeholder="Ask for a video, an avatar, or anything in between — I can get you started." className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0" />
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {[['Course lesson','/app/create?preset=lesson'],['Photo to video','/app/photo'],['Script to video','/app/create']].map(([l,h])=><Button key={l} variant="outline" size="sm" render={<Link href={h as string}/>}>{l}</Button>)}
            </div>
            <Button onClick={go}><Wand2 data-icon="inline-start"/>Start</Button>
          </div>
        </div>
      </div>
    </section>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tiles.map(({href,title,desc,icon:Icon,tone})=>(
        <Link key={href} href={href} className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="flex h-full flex-col gap-4 p-6">
              <span className={`grid size-11 place-items-center rounded-xl ${tone}`}><Icon className="size-5"/></span>
              <div className="flex-1"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{desc}</p></div>
              <span className="flex items-center gap-1 text-sm font-medium text-primary">Open<ArrowRight className="size-4 transition-transform group-hover:translate-x-1"/></span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </section>
  </div>
}
