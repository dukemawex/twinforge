import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, AudioLines, Captions, Copy, Cpu, LayoutGrid, ShieldCheck, Video } from 'lucide-react'
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
  return <main className="relative min-h-screen overflow-hidden">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
      <TwinForgeLogo />
      <nav className="flex items-center gap-2"><Button variant="ghost" render={<Link href="/sign-in" />}>Sign in</Button><Button render={<Link href="/sign-up" />}>Open studio</Button></nav>
    </header>

    {/* HERO with 3D shapes */}
    <section className="relative">
      <Image src="/marketing/shape-torus.png" alt="" width={180} height={180} className="tf-blob tf-reveal left-[-30px] top-[60px] w-24 sm:w-40" aria-hidden />
      <Image src="/marketing/shape-cube.png" alt="" width={150} height={150} className="tf-blob tf-reveal d2 right-[6%] top-[30px] w-20 sm:w-32" aria-hidden />
      <div className="relative z-10 mx-auto grid max-w-7xl gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1fr_460px] lg:items-center">
        <div>
          <span className="tf-reveal tf-chip inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground"><Cpu className="size-3 text-primary" /> Rendered on AMD Radeon GPU · ROCm</span>
          <h1 className="tf-reveal d1 mt-6 max-w-5xl text-balance text-5xl font-semibold leading-[.95] tracking-[-.055em] sm:text-7xl lg:text-8xl">Your presence,<br /><span className="text-primary">built to scale.</span></h1>
          <p className="tf-reveal d2 mt-8 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">Train a digital twin from one short clip, then turn any script into vertical, caption-ready video for Reels and TikTok — at GPU speed.</p>
          <div className="tf-reveal d3 mt-10 flex flex-wrap gap-3"><Button size="lg" render={<Link href="/sign-up" />}>Create your twin<ArrowRight data-icon="inline-end" /></Button><Button size="lg" variant="outline" render={<Link href="/sign-in" />}>Enter workspace</Button></div>
        </div>
        <div className="tf-reveal d2 tf-phone"><Image src="/marketing/hero-portrait.png" alt="A creator's AI digital twin presenting to camera" width={920} height={1560} priority /></div>
      </div>
    </section>

    {/* OUTPUT GALLERY */}
    <section className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <Image src="/marketing/shape-sphere.png" alt="" width={130} height={130} className="tf-blob right-[2%] top-0 hidden w-24 sm:block" aria-hidden />
      <div className="mb-10 flex max-w-2xl flex-col gap-3"><p className="font-mono text-xs uppercase tracking-[.22em] text-primary">Made for vertical</p><h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">One idea. A feed of Reels.</h2></div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{reels.map((src, i) => <div key={src} className={`tf-reveal d${i + 1} tf-phone`}><Image src={src} alt={`Sample generated vertical reel ${i + 1}`} width={720} height={1280} /></div>)}</div>
    </section>

    {/* BEFORE / AFTER */}
    <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
      <div className="tf-card-solid rounded-3xl p-6 sm:p-10">
        <div className="mb-8 flex max-w-2xl flex-col gap-3"><p className="font-mono text-xs uppercase tracking-[.22em] text-primary">One photo in, a presenter out</p><h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">From a selfie to a studio take.</h2></div>
        <div className="grid gap-6 sm:grid-cols-2">
          <figure><div className="tf-card-img"><Image src="/marketing/before-input.png" alt="Reference selfie input" width={800} height={800} /></div><figcaption className="mt-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Input · your reference</figcaption></figure>
          <figure><div className="tf-card-img"><Image src="/marketing/after-output.png" alt="Generated presenter output" width={800} height={800} /></div><figcaption className="mt-3 font-mono text-xs uppercase tracking-wider text-primary">Output · your twin, on script</figcaption></figure>
        </div>
      </div>
    </section>

    {/* FEATURES */}
    <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
      <div className="mb-10 flex max-w-2xl flex-col gap-3"><p className="font-mono text-xs uppercase tracking-[.22em] text-primary">Studio workflow</p><h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Everything the short-form grind needs.</h2></div>
      <div className="grid gap-4 md:grid-cols-3">{features.map(({ icon: Icon, title, text }, index) => <Card key={title} className="tf-card-solid"><CardHeader><div className="mb-8 flex items-center justify-between"><span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10"><Icon className="size-5 text-primary" /></span><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span></div><CardTitle>{title}</CardTitle></CardHeader><CardContent className="leading-relaxed text-muted-foreground">{text}</CardContent></Card>)}</div>
      <div className="tf-card-solid relative mt-16 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-3xl p-8 sm:flex-row sm:items-center">
        <Image src="/marketing/shapes-hero.png" alt="" width={220} height={220} className="pointer-events-none absolute right-[-30px] top-[-20px] w-40 opacity-90" aria-hidden />
        <div className="relative z-10"><p className="text-xl font-semibold">Start with your first twin</p><p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">Consent-backed, private by default, and yours to direct.</p></div>
        <Button className="relative z-10" render={<Link href="/sign-up" />}>Start creating<ArrowRight data-icon="inline-end" /></Button>
      </div>
    </section>

    <footer className="border-t"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8"><TwinForgeLogo compact /><span className="tf-chip inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground"><span className="tf-dot-live" /> Powered by AMD Radeon GPU · ROCm</span></div></footer>
  </main>
}
