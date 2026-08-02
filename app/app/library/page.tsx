import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getWorkspaceData } from '@/app/actions/data'
import { ProductionQueue } from '@/components/production-queue'
import { Button } from '@/components/ui/button'
export default async function Library(){const {videos,jobs}=await getWorkspaceData();return <div className="flex flex-col gap-8"><header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="font-mono text-xs uppercase tracking-[.22em] text-primary">Production queue</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.04em]">Videos</h1><p className="mt-3 max-w-2xl text-muted-foreground">Jobs submit to your GPU worker automatically when it is configured. Playback appears when rendering completes.</p></div><Button render={<Link href="/app/create"/>}><Plus data-icon="inline-start"/>Prepare video</Button></header><ProductionQueue videos={videos} jobs={jobs}/></div>}
