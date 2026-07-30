import { get } from '@vercel/blob'
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

async function resolveAsset(userId: string, assetId?: string | null) {
  if (!assetId) return null
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1)
  if (!asset) return null
  return {
    id: asset.id,
    kind: asset.kind,
    contentType: asset.contentType,
    url: `${appPublicUrl()}/api/worker/assets/${asset.id}`,
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
