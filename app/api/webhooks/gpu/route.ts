import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { renderJobs, videos } from '@/lib/db/schema'
import { gpuWebhookSecret } from '@/lib/gpu'

type GpuWebhookBody = {
  jobId?: string
  status?: string
  progress?: number
  stage?: string
  error?: string
  outputUrl?: string
  durationSeconds?: number
}

export async function POST(req: NextRequest) {
  const secret = gpuWebhookSecret()
  if (!secret) return NextResponse.json({ error: 'Webhook unavailable' }, { status: 503 })

  const raw = await req.text()
  const supplied = req.headers.get('x-twinforge-signature') || ''
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const valid =
    supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  let body: GpuWebhookBody
  try {
    body = JSON.parse(raw) as GpuWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const status = body.status || 'processing'
  const progress = Math.max(0, Math.min(100, body.progress ?? (status === 'completed' ? 100 : 0)))

  const [job] = await db
    .update(renderJobs)
    .set({
      status,
      progress,
      stage: body.stage,
      error: body.error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(renderJobs.externalJobId, body.jobId))
    .returning()

  // Fallback: workers may echo TwinForge's internal job id before externalJobId is set.
  const resolved =
    job ||
    (
      await db
        .update(renderJobs)
        .set({
          status,
          progress,
          stage: body.stage,
          error: body.error ?? null,
          externalJobId: body.jobId,
          updatedAt: new Date(),
        })
        .where(eq(renderJobs.id, body.jobId))
        .returning()
    )[0]

  if (!resolved) return NextResponse.json({ error: 'Unknown job' }, { status: 404 })

  const videoStatus =
    status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status === 'queued' ? 'queued' : 'processing'

  await db
    .update(videos)
    .set({
      status: videoStatus,
      externalUrl: body.outputUrl || undefined,
      durationSeconds: body.durationSeconds ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(videos.jobId, resolved.id))

  return NextResponse.json({ ok: true })
}
