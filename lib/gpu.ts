import { get, issueSignedToken, presignUrl, put } from '@vercel/blob'
import { db } from '@/lib/db'
import { mediaAssets, renderJobs, twins, videos } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export function gpuBaseUrl() {
  const raw = process.env.GPU_API_BASE_URL || process.env.GPU_API_URL || ''
  return raw.replace(/\/$/, '')
}

export function gpuApiKey() {
  return process.env.GPU_API_KEY || process.env.GPU_API_TOKEN || ''
}

export function gpuWebhookSecret() {
  return process.env.GPU_WEBHOOK_SECRET || ''
}

export function isGpuConfigured() {
  return Boolean(gpuBaseUrl() && gpuApiKey())
}

export function appPublicUrl() {
  const candidates = [
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    'https://twinforge-theta.vercel.app',
  ]
  for (const value of candidates) {
    if (!value) continue
    return value.startsWith('http') ? value.replace(/\/$/, '') : `https://${value.replace(/\/$/, '')}`
  }
  return 'http://localhost:3000'
}

export function getGpuReadinessFlags() {
  return {
    endpoint: Boolean(gpuBaseUrl()),
    token: Boolean(gpuApiKey()),
    webhookSecret: Boolean(gpuWebhookSecret()),
    connected: isGpuConfigured(),
  }
}

type JobRow = typeof renderJobs.$inferSelect

const ASSET_URL_TTL_MS = 6 * 60 * 60 * 1000
const STALE_JOB_MS = 30 * 60 * 1000

/**
 * Short-lived direct link to a private blob on *.blob.vercel-storage.com.
 *
 * The GPU worker cannot be assumed to reach this app's own hostname — a worker
 * behind a national firewall can reach Blob storage but not *.vercel.app. A
 * presigned URL keeps the asset private while removing that dependency.
 */
export async function presignedBlobUrl(pathname: string, ttlMs = ASSET_URL_TTL_MS) {
  const validUntil = Date.now() + ttlMs
  const token = await issueSignedToken({ pathname, operations: ['get'], validUntil })
  const { presignedUrl } = await presignUrl(token, {
    access: 'private',
    operation: 'get',
    pathname,
    validUntil,
  })
  return presignedUrl
}

async function resolveAsset(userId: string, assetId?: string | null) {
  if (!assetId) return null
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1)
  if (!asset) return null

  let url = `${appPublicUrl()}/api/worker/assets/${asset.id}`
  try {
    url = await presignedBlobUrl(asset.pathname)
  } catch (error) {
    console.error('Presign failed; falling back to proxy URL', error)
  }

  return {
    id: asset.id,
    kind: asset.kind,
    contentType: asset.contentType,
    url,
  }
}

export async function buildGpuJobRequest(job: JobRow) {
  const payload = (job.payload || {}) as Record<string, unknown>
  let twinName: string | undefined
  let referenceAsset = null as Awaited<ReturnType<typeof resolveAsset>>
  let voiceAsset = null as Awaited<ReturnType<typeof resolveAsset>>
  let photoAsset = null as Awaited<ReturnType<typeof resolveAsset>>

  if (job.twinId) {
    const [twin] = await db.select().from(twins).where(eq(twins.id, job.twinId)).limit(1)
    if (twin) {
      twinName = twin.name
      referenceAsset = await resolveAsset(job.userId, twin.referenceAssetId)
      voiceAsset = await resolveAsset(job.userId, twin.voiceAssetId)
    }
  }

  const photoAssetId = typeof payload.photoAssetId === 'string' ? payload.photoAssetId : null
  if (photoAssetId) photoAsset = await resolveAsset(job.userId, photoAssetId)

  return {
    jobId: job.id,
    kind: job.kind,
    payload,
    twin: twinName ? { id: job.twinId, name: twinName } : null,
    assets: {
      reference: referenceAsset,
      voice: voiceAsset,
      photo: photoAsset,
    },
    callbackUrl: `${appPublicUrl()}/api/webhooks/gpu`,
    assetAuthHeader: `Bearer ${gpuWebhookSecret() || gpuApiKey()}`,
  }
}

export async function dispatchRenderJob(jobId: string) {
  const [job] = await db.select().from(renderJobs).where(eq(renderJobs.id, jobId)).limit(1)
  if (!job) return { ok: false as const, error: 'Job not found' }

  if (!isGpuConfigured()) {
    await db
      .update(renderJobs)
      .set({ status: 'awaiting_gpu', stage: 'prepared', updatedAt: new Date() })
      .where(eq(renderJobs.id, jobId))
    await db
      .update(videos)
      .set({ status: 'awaiting_gpu', updatedAt: new Date() })
      .where(eq(videos.jobId, jobId))
    return { ok: false as const, error: 'GPU endpoint is not configured' }
  }

  const body = await buildGpuJobRequest(job)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)

  try {
    const upstream = await fetch(`${gpuBaseUrl()}/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${gpuApiKey()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })

    const text = await upstream.text()
    let json: { id?: string; jobId?: string; error?: string } = {}
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = { error: text.slice(0, 300) || 'Invalid GPU response' }
    }

    if (!upstream.ok) {
      const message = json.error || `GPU rejected job (${upstream.status})`
      await db
        .update(renderJobs)
        .set({ status: 'failed', stage: 'dispatch_failed', error: message, updatedAt: new Date() })
        .where(eq(renderJobs.id, jobId))
      await db
        .update(videos)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(videos.jobId, jobId))
      return { ok: false as const, error: message }
    }

    const externalJobId = json.id || json.jobId || job.id
    await db
      .update(renderJobs)
      .set({
        status: 'processing',
        progress: 5,
        stage: 'submitted',
        externalJobId,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(renderJobs.id, jobId))
    await db
      .update(videos)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(videos.jobId, jobId))

    return { ok: true as const, externalJobId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GPU request failed'
    await db
      .update(renderJobs)
      .set({ status: 'failed', stage: 'dispatch_failed', error: message, updatedAt: new Date() })
      .where(eq(renderJobs.id, jobId))
    await db
      .update(videos)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(videos.jobId, jobId))
    return { ok: false as const, error: message }
  } finally {
    clearTimeout(timer)
  }
}

export async function readPrivateAssetStream(pathname: string) {
  return get(pathname, { access: 'private' })
}

type WorkerJobState = {
  jobId?: string
  status?: string
  progress?: number
  stage?: string
  error?: string | null
  outputName?: string | null
  outputUrl?: string | null
  outputReady?: boolean
  durationSeconds?: number | null
}

/** Ask the worker directly how a job is doing. Inbound only, so firewall-safe. */
export async function fetchWorkerJobState(externalJobId: string): Promise<WorkerJobState | null> {
  if (!isGpuConfigured()) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${gpuBaseUrl()}/jobs/${encodeURIComponent(externalJobId)}`, {
      headers: { authorization: `Bearer ${gpuApiKey()}` },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as WorkerJobState
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Copy a finished render off the worker into Blob so it outlives the pod. */
async function importWorkerOutput(job: JobRow, state: WorkerJobState) {
  const name = state.outputName || `${job.id}.mp4`
  const res = await fetch(`${gpuBaseUrl()}/outputs/${encodeURIComponent(name)}`, {
    headers: { authorization: `Bearer ${gpuApiKey()}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Could not fetch output (${res.status})`)
  const buffer = await res.arrayBuffer()
  const pathname = `outputs/${job.userId}/${job.id}.mp4`
  await put(pathname, buffer, { access: 'private', contentType: 'video/mp4', allowOverwrite: true })
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      userId: job.userId,
      kind: 'output',
      pathname,
      contentType: 'video/mp4',
      size: buffer.byteLength,
    })
    .returning()
  return asset
}

/**
 * Pull current state for one in-flight job and write it to the database.
 * Returns true when something changed.
 */
export async function reconcileRenderJob(job: JobRow) {
  if (!isGpuConfigured()) return false
  const externalId = job.externalJobId || job.id
  const state = await fetchWorkerJobState(externalId)

  if (!state) {
    const age = Date.now() - new Date(job.updatedAt).getTime()
    if (age < STALE_JOB_MS) return false
    await db
      .update(renderJobs)
      .set({
        status: 'failed',
        stage: 'worker_lost',
        error: 'The GPU worker has no record of this job. It may have restarted.',
        updatedAt: new Date(),
      })
      .where(eq(renderJobs.id, job.id))
    await db
      .update(videos)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(videos.jobId, job.id))
    return true
  }

  const status = state.status || 'processing'
  const progress = Math.max(0, Math.min(100, state.progress ?? job.progress))

  if (status === 'completed') {
    let playbackUrl = state.outputUrl || null
    let outputAssetId: string | null = null
    try {
      const asset = await importWorkerOutput(job, state)
      if (asset) {
        outputAssetId = asset.id
        playbackUrl = await presignedBlobUrl(asset.pathname)
      }
    } catch (error) {
      // Keep the worker URL as a fallback so the render is not lost.
      console.error('Output import failed; falling back to worker URL', error)
    }

    await db
      .update(renderJobs)
      .set({ status: 'completed', progress: 100, stage: 'completed', error: null, updatedAt: new Date() })
      .where(eq(renderJobs.id, job.id))
    await db
      .update(videos)
      .set({
        status: 'completed',
        externalUrl: playbackUrl,
        outputAssetId: outputAssetId ?? undefined,
        durationSeconds: state.durationSeconds ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(videos.jobId, job.id))
    return true
  }

  if (status === 'failed') {
    await db
      .update(renderJobs)
      .set({
        status: 'failed',
        progress,
        stage: state.stage || 'failed',
        error: state.error || 'Render failed on the GPU worker',
        updatedAt: new Date(),
      })
      .where(eq(renderJobs.id, job.id))
    await db
      .update(videos)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(videos.jobId, job.id))
    return true
  }

  if (progress === job.progress && (state.stage || null) === job.stage) return false

  await db
    .update(renderJobs)
    .set({ status: 'processing', progress, stage: state.stage || job.stage, updatedAt: new Date() })
    .where(eq(renderJobs.id, job.id))
  await db
    .update(videos)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(eq(videos.jobId, job.id))
  return true
}
