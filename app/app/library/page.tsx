import Link from 'next/link'
import { getWorkspaceData } from '@/app/actions/data'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, Film, Plus } from 'lucide-react'

export default async function Library() {
  const { videos } = await getWorkspaceData()
  return <div className="flex flex-col gap-8"><header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="font-mono text-xs uppercase tracking-[.22em] text-primary">Outputs</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.04em]">Video library</h1><p className="mt-3 text-muted-foreground">Review and manage every finished production.</p></div><Button render={<Link href="/app/create" />}><Plus data-icon="inline-start" />New production</Button></header>{videos.length === 0 ? <Card><CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-5 text-center"><span className="flex size-16 items-center justify-center rounded-2xl border bg-muted"><Film className="text-primary" /></span><div><p className="text-xl font-medium">Your library starts with a production</p><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Finished videos will be organized here for review and download.</p></div><Button variant="outline" render={<Link href="/app/create" />}>Open creator<ArrowRight data-icon="inline-end" /></Button></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{videos.map(video => <Card key={video.id} className="overflow-hidden"><div className="flex aspect-video items-center justify-center bg-muted"><Film className="text-muted-foreground" /></div><CardHeader><CardTitle>{video.title}</CardTitle><CardDescription>{video.status}</CardDescription></CardHeader></Card>)}</div>}</div>
}
