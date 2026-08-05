import { get, issueSignedToken, presignUrl, put } from '@vercel/blob'
import { db } from '@/lib/db'
import { mediaAssets, renderJobs, twins, videos } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

/**
 * Normalize the worker base URL.
 *
 * People often paste a vLLM `/v1` URL or the Anrui gallery host. Both make
 * `POST /jobs` hit frp/nginx and return an HTML 404 that used to be dumped
 * into the production queue as the failure reason.
 */
export function normalizeGpuBaseUrl(raw: string) {
  let url = raw.trim()
  if (!url) return ''
  url = url.replace(/\/+$/, '')
  // Common mistaken suffixes when copying a chat/vLLM endpoint.
  url = url.replace(/\/(v1|api|jobs)(\/.*)?$/i, '')
  return url.replace(/\/+$/, '')
}

export function gpuBaseUrl() {
  const raw = process.env.GPU_API_BASE_URL || process.env.GPU_API_URL || ''
  return normalizeGpuBaseUrl(raw)
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

/** True when the URL is the Anrui gallery / a spaces vLLM path, not our worker. */
export function isLikelyWrongGpuHost(base = gpuBaseUrl()) {
  if (!base) return false
  try {
    const host = new URL(base).hostname.toLowerCase()
    if (host === 'radeon-global.anruicloud.com' || host.endsWith('.anruicloud.com')) {
      // Gallery / spaces hosts are not the TwinForge FastAPI worker.
      return true
    }
  } catch {
    return true
  }
  return /\/spaces\//i.test(base)
}

/**
 * Turn upstream GPU responses into a short actionable message.
 * frp returns a fixed HTML 404 when the tunnel is up but uvicorn is not.
 */
export function describeGpuUpstreamError(status: number, body: string) {
  const text = (body || '').trim()
  const lower = text.toLowerCase()
  const looksHtml = lower.startsWith('<!doctype') || lower.includes('<html')
  const isFrp =
    (lower.includes('powered by') && lower.includes('frp')) ||
    lower.includes('the page you requested was not found') ||
    lower.includes('faithfully yours, frp')

  if (isFrp || (looksHtml && status === 404)) {
    return (
      'GPU tunnel is reachable, but nothing is listening on the worker port. ' +
      'On the Anrui pod: start `uvicorn main:app --host 127.0.0.1 --port 8081`, ' +
      'then `rc-tunnel expose --port 8081`, and set GPU_API_BASE_URL to that rc-*.radeon.firstdg.ai URL (not the gallery).'
    )
  }

  if (isLikelyWrongGpuHost()) {
    return (
      'GPU_API_BASE_URL points at the Anrui gallery / a vLLM space, not the TwinForge worker. ' +
      'Use the rc-tunnel URL from `rc-tunnel expose --port 8081`.'
    )
  }

  if (looksHtml) {
    return `GPU endpoint returned HTML instead of JSON (${status}). Check GPU_API_BASE_URL points at the running TwinForge worker.`
  }

  try {
    const json = text ? (JSON.parse(text) as { error?: string; detail?: string }) : {}
    if (json.error) return json.error
    if (typeof json.detail === 'string') return json.detail
  } catch {
    // fall through
  }

  if (text) return text.slice(0, 280)
  return `GPU rejected job (${status})`
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

export type GpuProbeResult = {
  ok: boolean
  configured: boolean
  reachable: boolean
  message: string
  ffmpeg?: boolean
  tts?: boolean
  lipsync?: boolean
  lipsyncDevice?: string
}

/** Live check against GET /health so Settings does not lie when only env vars are set. */
export async function probeGpuWorker(): Promise<GpuProbeResult> {
  const base = gpuBaseUrl()
  const key = gpuApiKey()
  if (!base || !key) {
    return {
      ok: false,
      configured: false,
      reachable: false,
      message: 'Add GPU_API_BASE_URL + GPU_API_KEY in Vercel (use the rc-tunnel worker URL, not the Anrui gallery).',
    }
  }

  if (isLikelyWrongGpuHost(base)) {
    return {
      ok: false,
      configured: true,
      reachable: false,
      message:
        'GPU_API_BASE_URL looks like the Anrui gallery or a vLLM /spaces URL. Point it at the TwinForge worker tunnel instead.',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${base}/health`, {
      headers: { authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        reachable: false,
        message: describeGpuUpstreamError(res.status, text),
      }
    }
    let json: {
      ok?: boolean
      ffmpeg?: boolean
      tts?: boolean
      polling?: boolean
      lipsync?: { ready?: boolean; device?: string }
      version?: string
    } = {}
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      return {
        ok: false,
        configured: true,
        reachable: true,
        message: describeGpuUpstreamError(res.status, text),
      }
    }
    if (!json.ok) {
      return {
        ok: false,
        configured: true,
        reachable: true,
        message: 'Worker responded, but /health did not report ok:true. Is TwinForge gpu-worker running?',
      }
    }
    const lipsync = Boolean(json.lipsync?.ready)
    const parts = [
      json.ffmpeg ? 'ffmpeg' : 'ffmpeg missing',
      json.tts ? 'tts' : 'tts missing',
      lipsync ? `lip-sync (${json.lipsync?.device || 'gpu'})` : 'lip-sync not bootstrapped',
    ]
    return {
      ok: true,
      configured: true,
      reachable: true,
      ffmpeg: Boolean(json.ffmpeg),
      tts: Boolean(json.tts),
      lipsync,
      lipsyncDevice: json.lipsync?.device,
      message: lipsync
        ? `Worker ready — ${parts.join(', ')}.`
        : `Worker reachable (${parts.join(', ')}). Run scripts/bootstrap_talking_head.sh on the pod for real lip-sync.`,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'request failed'
    return {
      ok: false,
      configured: true,
      reachable: false,
      message: `Could not reach GPU worker (${reason}). Confirm the tunnel is exposed and uvicorn is running.`,
    }
  } finally {
    clearTimeout(timer)
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

  if (isLikelyWrongGpuHost()) {
    const message = describeGpuUpstreamError(404, '')
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
      json = {}
    }

    if (!upstream.ok) {
      const message = describeGpuUpstreamError(upstream.status, text)
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
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(`${gpuBaseUrl()}/outputs/${encodeURIComponent(name)}`, {
        headers: { authorization: `Bearer ${gpuApiKey()}` },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Could not fetch output (${res.status})`)
      const buffer = await res.arrayBuffer()
      if (!buffer.byteLength) throw new Error('Worker returned an empty output')
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
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Output import failed')
      console.error(`Output import attempt ${attempt}/3 failed`, lastError)
    }
  }
  throw lastError || new Error('Output import failed')
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
