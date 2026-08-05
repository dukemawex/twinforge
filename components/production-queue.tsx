'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Film, LoaderCircle, RotateCcw, Search, Trash2 } from 'lucide-react'
import { deleteVideo, reconcileMyJobs, retryGpuJob } from '@/app/actions/data'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Video = {
  id: string
  title: string
  status: string
  createdAt: Date
  jobId?: string | null
  externalUrl?: string | null
  playbackUrl?: string | null
}

type Job = {
  id: string
  progress: number
  stage?: string | null
  error?: string | null
}

const IN_FLIGHT = ['queued', 'processing']

function stageLabel(stage?: string | null) {
  if (!stage) return null
  const map: Record<string, string> = {
    accepted: 'Accepted by GPU',
    submitted: 'Submitted',
    script: 'Preparing script',
    assets: 'Downloading assets',
    rendering: 'Rendering',
    completed: 'Completed',
    failed: 'Failed',
    dispatch_failed: 'Could not reach GPU',
    worker_lost: 'Worker lost the job',
    retrying: 'Retrying',
    prepared: 'Prepared',
  }
  return map[stage] || stage
}

function statusLabel(status: string) {
  if (status === 'awaiting_gpu') return 'Waiting for GPU config'
  if (status === 'queued') return 'Queued for GPU'
  if (status === 'processing') return 'Processing on GPU'
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  return status
}

export function ProductionQueue({ videos, jobs = [] }: { videos: Video[]; jobs?: Job[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  const hasInFlight = videos.some((v) => IN_FLIGHT.includes(v.status))

  // The worker cannot always reach us, so poll it while anything is running.
  useEffect(() => {
    if (!hasInFlight) return
    let cancelled = false
    const tick = async () => {
      try {
        await reconcileMyJobs()
      } catch {
        // transient; the next tick retries
      }
    }
    void tick()
    const id = setInterval(() => {
      if (!cancelled) void tick()
    }, 10000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [hasInFlight])
  const shown = useMemo(
    () =>
      videos.filter(
        (v) => (filter === 'all' || v.status === filter) && v.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [videos, query, filter],
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-3 text-muted-foreground" />
          <Input
            aria-label="Search productions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search productions"
            className="pl-10"
          />
        </label>
        <select
          aria-label="Filter productions"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="awaiting_gpu">Waiting for config</option>
          <option value="queued">Queued</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {shown.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-72 flex-col items-center justify-center gap-4 text-center">
            <Film className="text-primary" />
            <div>
              <p className="font-medium">No matching productions</p>
              <p className="mt-2 text-sm text-muted-foreground">Prepare a production or adjust the filters.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((video) => (
            <Card key={video.id}>
              <div className="flex aspect-video items-center justify-center bg-muted">
                {(video.playbackUrl || video.externalUrl) && video.status === 'completed' ? (
                  <video
                    src={video.playbackUrl || video.externalUrl || undefined}
                    controls
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Film className="text-muted-foreground" />
                )}
              </div>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{video.title}</CardTitle>
                    <CardDescription className="mt-2">
                      {statusLabel(video.status)}
                      {(() => {
                        const job = video.jobId ? jobById.get(video.jobId) : undefined
                        if (!job) return null
                        const label = stageLabel(job.stage)
                        if (IN_FLIGHT.includes(video.status)) {
                          return (
                            <span className="block text-xs text-muted-foreground">
                              {label ? `${label} · ` : ''}
                              {job.progress}%
                            </span>
                          )
                        }
                        if (video.status === 'failed' && job.error) {
                          return <span className="block text-xs text-destructive">{job.error}</span>
                        }
                        return null
                      })()}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    {(video.status === 'failed' ||
                      video.status === 'awaiting_gpu' ||
                      video.status === 'processing') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Retry ${video.title}`}
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            setError('')
                            try {
                              await retryGpuJob(video.id)
                            } catch (e) {
                              setError(e instanceof Error ? e.message : 'Retry failed')
                            }
                          })
                        }
                      >
                        {pending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${video.title}`}
                      disabled={pending}
                      onClick={() => start(() => deleteVideo(video.id))}
                    >
                      {pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
