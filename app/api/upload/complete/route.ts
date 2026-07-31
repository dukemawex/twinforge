import { head } from '@vercel/blob'
import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { mediaAssets } from '@/lib/db/schema'
import { uploadAllowed, uploadLimits, type UploadKind } from '../route'

const isKind = (v: unknown): v is UploadKind => typeof v === 'string' && v in uploadLimits

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let payload: { pathname?: unknown; kind?: unknown; name?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { pathname, kind } = payload
  if (typeof pathname !== 'string' || !isKind(kind)) return NextResponse.json({ error: 'Choose a supported file' }, { status: 400 })
  if (!new RegExp(`^uploads/${kind}/[A-Za-z0-9._-]+$`).test(pathname)) return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 })

  try {
    // Re-read the stored blob rather than trusting anything the browser reported.
    const blob = await head(pathname)
    const contentType = blob.contentType || ''
    if (!(uploadAllowed[kind] as readonly string[]).includes(contentType)) return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 })
    if (!blob.size || blob.size > uploadLimits[kind]) return NextResponse.json({ error: 'File size is outside the allowed range' }, { status: 400 })

    const existing = await db.select().from(mediaAssets).where(eq(mediaAssets.pathname, pathname)).limit(1)
    if (existing[0]) {
      if (existing[0].userId !== session.user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const name = typeof payload.name === 'string' ? payload.name : pathname.split('/').pop() || 'file'
      return NextResponse.json({ asset: { id: existing[0].id, name, size: existing[0].size, contentType: existing[0].contentType } })
    }

    const [asset] = await db.insert(mediaAssets).values({ userId: session.user.id, kind, pathname, contentType, size: blob.size }).returning()
    const name = typeof payload.name === 'string' ? payload.name : pathname.split('/').pop() || 'file'
    return NextResponse.json({ asset: { id: asset.id, name, size: asset.size, contentType: asset.contentType } })
  } catch {
    return NextResponse.json({ error: 'Upload could not be completed' }, { status: 500 })
  }
}
