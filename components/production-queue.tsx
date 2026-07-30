'use client'
import { useMemo, useState, useTransition } from 'react'
import { Film, LoaderCircle, RotateCcw, Search, Trash2 } from 'lucide-react'
import { deleteVideo, retryGpuJob } from '@/app/actions/data'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Video = {
  id: string
  title: string
  status: string
  createdAt: Date
  externalUrl?: string | null
}

function statusLabel(status: string) {
  if (status === 'awaiting_gpu') return 'Waiting for GPU config'
  if (status === 'queued') return 'Queued for GPU'
  if (status === 'processing') return 'Processing on GPU'
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  return status
}

export function ProductionQueue({ videos }: { videos: Video[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
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
                {video.externalUrl && video.status === 'completed' ? (
                  <video src={video.externalUrl} controls className="h-full w-full object-cover" />
                ) : (
                  <Film className="text-muted-foreground" />
                )}
              </div>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{video.title}</CardTitle>
                    <CardDescription className="mt-2">{statusLabel(video.status)}</CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    {(video.status === 'failed' || video.status === 'awaiting_gpu') && (
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
