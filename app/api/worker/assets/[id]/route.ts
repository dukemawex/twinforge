import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { mediaAssets } from '@/lib/db/schema'
import { gpuApiKey, gpuWebhookSecret, readPrivateAssetStream } from '@/lib/gpu'

function authorized(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const allowed = [gpuWebhookSecret(), gpuApiKey()].filter(Boolean)
  return Boolean(token && allowed.includes(token))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1)
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await readPrivateAssetStream(asset.pathname)
  if (!result) return new NextResponse('Not found', { status: 404 })
  if (result.statusCode === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' },
    })
  }

  return new NextResponse(result.stream, {
    headers: {
      'Content-Type': result.blob.contentType || asset.contentType,
      ETag: result.blob.etag,
      'Cache-Control': 'private, no-cache',
    },
  })
}
