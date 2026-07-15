import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, AudioLines, Captions, Clapperboard, Copy, Cpu, LayoutGrid, ShieldCheck, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TwinForgeLogo } from '@/components/twinforge-logo'

const features = [
  { icon: LayoutGrid, title: 'Reels-first, vertical by default', text: '9:16 output with IG and TikTok safe zones built in — not an afterthought.' },
  { icon: Captions, title: 'Captions burned in', text: 'Animated word-by-word captions in one toggle. Ready to post, no plugins.' },
  { icon: Copy, title: 'Batch a week from one idea', text: 'Turn one topic into ten vertical variations in a single render job.' },
  { icon: AudioLines, title: 'Your voice, any language', text: 'Clone your voice once, deliver in 20+ languages with natural emotion.' },
  { icon: ShieldCheck, title: 'Likeness stays yours', text: 'Consent-locked twins. Your identity never leaves your own compute.' },
  { icon: Video, title: 'Direct every frame', text: 'Scripts, framing, backgrounds, and delivery from one focused workspace.' },
]

const reels = ['/marketing/reel-1.png', '/marketing/reel-2.png', '/marketing/reel-3.png']

export default function Home() {
  return <main className="min-h-screen overflow-hidden">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
      <TwinForgeLogo />
      <nav className="flex items-center gap-2"><Button variant="ghost" render={<Link href="/sign-in" />}>Sign in</Button><Button render={<Link href="/sign-up" />}>Open studio</Button></nav>
    </header>

    {/* HERO */}
    <section className="tf-hero-glow border-y">
      <div className="relative z-10 mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_440px] lg:items-center lg:py-32">
        <div>
          <span className="tf-reveal tf-chip font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground"><Cpu className="size-3 text-accent" /> Rendered on AMD Radeon GPU · ROCm</span>
          <h1 className="tf-reveal d1 mt-6 max-w-5xl text-balance text-5xl font-semibold leading-[.95] tracking-[-.055em] sm:text-7xl lg:text-8xl">Your presence,<br /><span className="tf-gradient-text">built to scale.</span></h1>
          <p className="tf-reveal d2 mt-8 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">Train a digital twin from one short clip, then turn any script into vertical, caption-ready video for Reels and TikTok — at GPU speed.</p>
          <div className="tf-reveal d3 mt-10 flex flex-wrap gap-3"><Button size="lg" render={<Link href="/sign-up" />}>Create your twin<ArrowRight data-icon="inline-end" /></Button><Button size="lg" variant="outline" render={<Link href="/sign-in" />}>Enter workspace</Button></div>
        </div>
        <div className="tf-reveal d2 tf-phone">
          <Image src="/marketing/hero-portrait.png" alt="A creator's AI digital twin presenting to camera" width={880} height={1560} priority />
        </div>
      </div>
    </section>

    {/* OUTPUT GALLERY */}
    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <div className="mb-10 flex max-w-2xl flex-col gap-3"><p className="font-mono text-xs uppercase tracking-[.22em] text-primary">Made for vertical</p><h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">One idea. A feed of Reels.</h2></div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {reels.map((src, i) => <div key={src} className={`tf-reveal d${i + 1} tf-phone`}><Image src={src} alt={`Sample generated vertical reel ${i + 1}`} width={720} height={1280} /></div>)}
      </div>
    </section>

    {/* BEFORE / AFTER */}
    <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
      <div className="rounded-3xl border bg-card p-6 sm:p-10">
        <div className="mb-8 flex max-w-2xl flex-col gap-3"><p className="font-mono text-xs uppercase tracking-[.22em] text-primary">One photo in, a presenter out</p><h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">From a selfie to a studio take.</h2></div>
        <div className="grid gap-6 sm:grid-cols-2">
          <figure><div className="tf-card-img"><Image src="/marketing/before-input.png" alt="Reference selfie input" width={800} height={800} /></div><figcaption className="mt-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Input · your reference</figcaption></figure>
          <figure><div className="tf-card-img"><Image src="/marketing/after-output.png" alt="Generated presenter output" width={800} height={800} /></div><figcaption className="mt-3 font-mono text-xs uppercase tracking-wider text-accent">Output · your twin, on script</figcaption></figure>
        </div>
      </div>
    </section>

    {/* FEATURES */}
    <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
      <div className="mb-10 flex max-w-2xl flex-col gap-3"><p className="font-mono text-xs uppercase tracking-[.22em] text-primary">Studio workflow</p><h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Everything the short-form grind needs.</h2></div>
      <div className="grid gap-4 md:grid-cols-3">
        {features.map(({ icon: Icon, title, text }, index) => <Card key={title} className="bg-card/70"><CardHeader><div className="mb-8 flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10"><Icon className="size-5 text-primary" /></span><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span></div><CardTitle>{title}</CardTitle></CardHeader><CardContent className="leading-relaxed text-muted-foreground">{text}</CardContent></Card>)}
      </div>
      <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-3xl border bg-card p-8 sm:flex-row sm:items-center"><div className="flex items-start gap-4"><Clapperboard className="mt-1 text-accent" /><div><p className="font-medium">Start with your first twin</p><p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">Consent-backed, private by default, and yours to direct.</p></div></div><Button render={<Link href="/sign-up" />}>Start creating<ArrowRight data-icon="inline-end" /></Button></div>
    </section>

    <footer className="border-t"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8"><TwinForgeLogo compact /><span className="tf-chip font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground"><span className="tf-dot-live" /> Powered by AMD Radeon GPU · ROCm</span></div></footer>
  </main>
}
