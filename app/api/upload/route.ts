import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

const limits = { reference: 250 * 1024 * 1024, voice: 30 * 1024 * 1024, photo: 15 * 1024 * 1024, csv: 5 * 1024 * 1024 } as const
const allowed = {
  reference: ['video/mp4', 'video/webm', 'video/quicktime'],
  voice: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/webm'],
  photo: ['image/png', 'image/jpeg', 'image/webp'],
  csv: ['text/csv', 'application/vnd.ms-excel'],
} as const
export type UploadKind = keyof typeof limits
export const uploadLimits = limits
export const uploadAllowed = allowed
const isKind = (v: unknown): v is UploadKind => typeof v === 'string' && v in limits

// Client uploads go straight from the browser to Blob storage. Routing the file
// through this function would cap it at Vercel's 4.5 MB request body limit and
// return a non-JSON "Request Entity Too Large" page.
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let kind: unknown
        try {
          kind = clientPayload ? (JSON.parse(clientPayload) as { kind?: unknown }).kind : undefined
        } catch {
          throw new Error('Choose a supported file')
        }
        if (!isKind(kind)) throw new Error('Choose a supported file')
        // The browser picks the pathname, so pin it to a shape we control.
        if (!new RegExp(`^uploads/${kind}/[A-Za-z0-9._-]+$`).test(pathname)) throw new Error('Invalid upload path')
        return {
          allowedContentTypes: [...allowed[kind]],
          maximumSizeInBytes: limits[kind],
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ userId: session.user.id, kind }),
        }
      },
      // The media_assets row is written by /api/upload/complete, which the browser
      // calls once the upload resolves, so there is a single write path.
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload could not be started' }, { status: 400 })
  }
}
