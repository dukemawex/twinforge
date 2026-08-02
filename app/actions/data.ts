'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { mediaAssets, renderJobs, twins, videos } from '@/lib/db/schema'
import {
  dispatchRenderJob,
  getGpuReadinessFlags,
  isGpuConfigured,
  presignedBlobUrl,
  reconcileRenderJob,
} from '@/lib/gpu'

export async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function getWorkspaceData() {
  const userId = await getUserId()
  const [twinRows, videoRows, jobRows] = await Promise.all([
    db.select().from(twins).where(eq(twins.userId, userId)).orderBy(desc(twins.createdAt)),
    db.select().from(videos).where(eq(videos.userId, userId)).orderBy(desc(videos.createdAt)),
    db.select().from(renderJobs).where(eq(renderJobs.userId, userId)).orderBy(desc(renderJobs.createdAt)),
  ])
  const outputIds = videoRows
    .map((v) => v.outputAssetId)
    .filter((id): id is string => Boolean(id))
  const outputAssets = outputIds.length
    ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, outputIds))
    : []
  const assetById = new Map(outputAssets.map((a) => [a.id, a]))

  // Playback links are minted per request: private blobs, short-lived URLs.
  const videosWithPlayback = await Promise.all(
    videoRows.map(async (video) => {
      const asset = video.outputAssetId ? assetById.get(video.outputAssetId) : undefined
      if (!asset) return { ...video, playbackUrl: video.externalUrl }
      try {
        return { ...video, playbackUrl: await presignedBlobUrl(asset.pathname) }
      } catch {
        return { ...video, playbackUrl: video.externalUrl }
      }
    }),
  )

  return { twins: twinRows, videos: videosWithPlayback, jobs: jobRows }
}

/**
 * Pull the truth from the GPU worker for anything still in flight.
 *
 * The worker cannot always call us back, so the app asks instead. Without this
 * a job whose webhook is lost stays "processing" forever.
 */
export async function reconcileMyJobs() {
  const userId = await getUserId()
  if (!isGpuConfigured()) return { updated: 0, pending: 0 }

  const pending = await db
    .select()
    .from(renderJobs)
    .where(and(eq(renderJobs.userId, userId), inArray(renderJobs.status, ['queued', 'processing'])))

  let updated = 0
  for (const job of pending) {
    try {
      if (await reconcileRenderJob(job)) updated += 1
    } catch (error) {
      console.error('Reconcile failed for job', job.id, error)
    }
  }
  if (updated) revalidatePath('/app/library')
  return { updated, pending: pending.length }
}

export async function getTwins() {
  const userId = await getUserId()
  return db.select().from(twins).where(eq(twins.userId, userId)).orderBy(desc(twins.createdAt))
}

const twinInput = z.object({
  name: z.string().trim().min(2).max(80),
  referenceAssetId: z.string().uuid(),
  voiceAssetId: z.string().uuid().optional().nullable(),
  consent: z.literal(true),
})

export async function createPreparedTwin(input: z.input<typeof twinInput>) {
  const userId = await getUserId()
  const value = twinInput.parse(input)
  const ids = [value.referenceAssetId, ...(value.voiceAssetId ? [value.voiceAssetId] : [])]
  const owned = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.userId, userId), inArray(mediaAssets.id, ids)))
  if (owned.length !== ids.length) throw new Error('Files could not be verified')
  const [record] = await db
    .insert(twins)
    .values({
      userId,
      name: value.name,
      status: 'ready_for_training',
      referenceAssetId: value.referenceAssetId,
      voiceAssetId: value.voiceAssetId ?? null,
      consentRecordedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()
  revalidatePath('/app')
  revalidatePath('/app/twins')
  return record
}

const productionInput = z.object({
  twinId: z.string().uuid(),
  title: z.string().trim().min(2).max(140),
  script: z.string().trim().min(10).max(20000),
  language: z.string().min(2).max(30),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  resolution: z.enum(['720p', '1080p', '4k']),
  captions: z.boolean(),
})

async function ownTwin(userId: string, id: string) {
  const [record] = await db
    .select()
    .from(twins)
    .where(and(eq(twins.userId, userId), eq(twins.id, id)))
    .limit(1)
  if (!record) throw new Error('Presenter not found')
  return record
}

async function afterJobCreated(jobId: string) {
  if (!isGpuConfigured()) return { dispatched: false as const }
  const result = await dispatchRenderJob(jobId)
  return { dispatched: result.ok, error: result.ok ? undefined : result.error }
}

export async function prepareVideo(input: z.input<typeof productionInput>) {
  const userId = await getUserId()
  const value = productionInput.parse(input)
  await ownTwin(userId, value.twinId)
  const result = await db.transaction(async (tx) => {
    const [job] = await tx
      .insert(renderJobs)
      .values({
        userId,
        twinId: value.twinId,
        kind: 'video',
        status: isGpuConfigured() ? 'queued' : 'awaiting_gpu',
        progress: 0,
        stage: 'prepared',
        payload: value,
        updatedAt: new Date(),
      })
      .returning()
    const [video] = await tx
      .insert(videos)
      .values({
        userId,
        jobId: job.id,
        twinId: value.twinId,
        title: value.title,
        status: isGpuConfigured() ? 'queued' : 'awaiting_gpu',
        updatedAt: new Date(),
      })
      .returning()
    return { job, video }
  })
  await afterJobCreated(result.job.id)
  revalidatePath('/app')
  revalidatePath('/app/library')
  return result
}

export async function prepareBatch(input: {
  twinId: string
  language: string
  aspectRatio: '16:9' | '9:16' | '1:1'
  resolution: '720p' | '1080p' | '4k'
  captions: boolean
  rows: Array<{ title: string; script: string }>
}) {
  const userId = await getUserId()
  await ownTwin(userId, input.twinId)
  const rows = z
    .array(
      z.object({
        title: z.string().trim().min(2).max(140),
        script: z.string().trim().min(10).max(20000),
      }),
    )
    .min(1)
    .max(250)
    .parse(input.rows)

  const created = await db.transaction(async (tx) => {
    const output = []
    for (const row of rows) {
      const payload = productionInput.parse({ ...input, ...row })
      const [job] = await tx
        .insert(renderJobs)
        .values({
          userId,
          twinId: input.twinId,
          kind: 'batch_video',
          status: isGpuConfigured() ? 'queued' : 'awaiting_gpu',
          progress: 0,
          stage: 'prepared',
          payload,
          updatedAt: new Date(),
        })
        .returning()
      const [video] = await tx
        .insert(videos)
        .values({
          userId,
          jobId: job.id,
          twinId: input.twinId,
          title: row.title,
          status: isGpuConfigured() ? 'queued' : 'awaiting_gpu',
          updatedAt: new Date(),
        })
        .returning()
      output.push({ video, jobId: job.id })
    }
    return output
  })

  for (const item of created) {
    await afterJobCreated(item.jobId)
  }

  revalidatePath('/app')
  revalidatePath('/app/library')
  return { accepted: created.length }
}

const photoInput = z.object({
  photoAssetId: z.string().uuid(),
  title: z.string().trim().min(2).max(140),
  script: z.string().trim().min(10).max(20000),
  language: z.string().min(2).max(30),
  voice: z.string().trim().min(1).max(60),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  resolution: z.enum(['720p', '1080p', '4k']),
  captions: z.boolean(),
})

export async function preparePhotoVideo(input: z.input<typeof photoInput>) {
  const userId = await getUserId()
  const value = photoInput.parse(input)
  const [asset] = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.userId, userId), eq(mediaAssets.id, value.photoAssetId)))
    .limit(1)
  if (!asset) throw new Error('Photo could not be verified')

  const result = await db.transaction(async (tx) => {
    const [job] = await tx
      .insert(renderJobs)
      .values({
        userId,
        kind: 'photo_video',
        status: isGpuConfigured() ? 'queued' : 'awaiting_gpu',
        progress: 0,
        stage: 'prepared',
        payload: value,
        updatedAt: new Date(),
      })
      .returning()
    const [video] = await tx
      .insert(videos)
      .values({
        userId,
        jobId: job.id,
        title: value.title,
        status: isGpuConfigured() ? 'queued' : 'awaiting_gpu',
        updatedAt: new Date(),
      })
      .returning()
    return { job, video }
  })

  await afterJobCreated(result.job.id)
  revalidatePath('/app')
  revalidatePath('/app/library')
  return result
}

export async function deleteVideo(id: string) {
  const userId = await getUserId()
  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, id), eq(videos.userId, userId)))
    .limit(1)
  if (!video) throw new Error('Video not found')
  await db.transaction(async (tx) => {
    if (video.jobId) {
      await tx.delete(renderJobs).where(and(eq(renderJobs.id, video.jobId), eq(renderJobs.userId, userId)))
    }
    await tx.delete(videos).where(and(eq(videos.id, id), eq(videos.userId, userId)))
  })
  revalidatePath('/app/library')
}

export async function retryGpuJob(videoId: string) {
  const userId = await getUserId()
  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
    .limit(1)
  if (!video?.jobId) throw new Error('Video job not found')
  if (!isGpuConfigured()) throw new Error('GPU endpoint is not configured')

  await db
    .update(renderJobs)
    .set({ status: 'queued', progress: 0, stage: 'retrying', error: null, updatedAt: new Date() })
    .where(eq(renderJobs.id, video.jobId))
  await db.update(videos).set({ status: 'queued', updatedAt: new Date() }).where(eq(videos.id, videoId))

  const result = await dispatchRenderJob(video.jobId)
  revalidatePath('/app/library')
  if (!result.ok) throw new Error(result.error)
  return result
}

export async function getGpuReadiness() {
  await getUserId()
  return getGpuReadinessFlags()
}
