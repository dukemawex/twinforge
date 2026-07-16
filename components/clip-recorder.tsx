'use client'
import { useCallback, useRef, useState } from 'react'
import { Circle, Square, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ClipRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const [state, setState] = useState<'idle'|'live'|'recording'|'error'>('idle')
  const [seconds, setSeconds] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setState('live')
    } catch { setState('error') }
  }, [])
  const record = () => {
    if (!streamRef.current) return
    chunks.current = []
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const rec = new MediaRecorder(streamRef.current, { mimeType: mime })
    rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: 'video/webm' })
      onRecorded(new File([blob], `twin-clip-${Date.now()}.webm`, { type: 'video/webm' }))
      streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      if (timer.current) clearInterval(timer.current)
      setState('idle')
    }
    recRef.current = rec; rec.start(); setState('recording'); setSeconds(0)
    timer.current = setInterval(() => setSeconds(s => { if (s >= 59) { rec.stop(); return s } return s + 1 }), 1000)
  }
  const stop = () => recRef.current?.stop()
  return <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
      <video ref={videoRef} muted playsInline className="size-full object-cover" />
      {state === 'idle' && <div className="absolute inset-0 grid place-items-center text-center text-sm text-white/70"><div><Video className="mx-auto mb-2 size-7" />Record a short clip to create your digital twin</div></div>}
      {state === 'recording' && <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white"><span className="size-2 animate-pulse rounded-full bg-red-500" />{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</span>}
    </div>
    {state === 'error' && <p className="text-sm text-destructive">Camera access was blocked. Allow camera and microphone, or upload a file instead.</p>}
    <div className="flex gap-2">
      {state === 'idle' && <Button type="button" variant="outline" onClick={start}><Video data-icon="inline-start" />Open camera</Button>}
      {state === 'live' && <Button type="button" onClick={record}><Circle data-icon="inline-start" className="fill-current" />Start recording</Button>}
      {state === 'recording' && <Button type="button" variant="destructive" onClick={stop}><Square data-icon="inline-start" className="fill-current" />Stop &amp; use clip</Button>}
    </div>
  </div>
}
