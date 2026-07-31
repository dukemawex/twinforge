import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { gpuApiKey, gpuBaseUrl } from '@/lib/gpu'

const METHODS = ['GET', 'POST']

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const base = gpuBaseUrl()
  const key = gpuApiKey()
  if (!base) return NextResponse.json({ error: 'GPU endpoint offline' }, { status: 503 })
  if (!METHODS.includes(req.method)) return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })

  const { path } = await params
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const body = req.method === 'GET' ? undefined : await req.text()
    const upstream = await fetch(`${base}/${path.map(encodeURIComponent).join('/')}`, {
      method: req.method,
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body,
      signal: controller.signal,
      cache: 'no-store',
    })
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
    })
  } catch {
    return NextResponse.json({ error: 'GPU request timed out' }, { status: 504 })
  } finally {
    clearTimeout(timer)
  }
}

export const GET = proxy
export const POST = proxy
