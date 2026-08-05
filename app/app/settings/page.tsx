import { CheckCircle2, CircleDashed, Cpu, ShieldCheck } from 'lucide-react'
import { getGpuReadiness } from '@/app/actions/data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function Settings() {
  const gpu = await getGpuReadiness()
  const checks = [
    ['Service endpoint', gpu.endpoint],
    ['Authentication token', gpu.token],
    ['Webhook verification', gpu.webhookSecret],
    ['Live worker /health', gpu.probe.ok],
    ['Talking-head lip-sync', Boolean(gpu.probe.lipsync)],
  ] as const

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[.22em] text-primary">Workspace</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em]">Integration readiness</h1>
        <p className="mt-3 text-muted-foreground">
          Review what is configured without exposing credentials in the browser.
        </p>
      </header>
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
              <Cpu className="text-primary" />
            </span>
            <div>
              <CardTitle>GPU production service</CardTitle>
              <CardDescription className="mt-2">
                {gpu.connected
                  ? gpu.probe.message
                  : gpu.endpoint && gpu.token
                    ? gpu.probe.message
                    : 'Add GPU_API_BASE_URL + GPU_API_KEY in Vercel. Use the rc-tunnel worker URL, not the Anrui gallery.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {checks.map(([label, ready]) => (
            <div key={label} className="flex items-center justify-between rounded-xl border p-4">
              <div className="flex items-center gap-3">
                {ready ? (
                  <CheckCircle2 className="text-primary" />
                ) : (
                  <CircleDashed className="text-muted-foreground" />
                )}
                <span className="text-sm font-medium">{label}</span>
              </div>
              <span className="font-mono text-xs uppercase text-muted-foreground">
                {ready ? 'Configured' : 'Pending'}
              </span>
            </div>
          ))}
          {!gpu.probe.ok && gpu.endpoint && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-relaxed text-destructive">
              {gpu.probe.message}
            </div>
          )}
          {gpu.probe.ok && !gpu.probe.lipsync && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-relaxed">
              Lip-sync models are not on the pod yet. Renders still work (motion + TTS). For real
              talking-head output run{' '}
              <code className="font-mono text-xs">bash scripts/bootstrap_talking_head.sh</code> in{' '}
              <code className="font-mono text-xs">gpu-worker</code>, restart uvicorn, then retry a job.
            </div>
          )}
          <div className="mt-2 flex items-start gap-3 rounded-xl bg-secondary p-4">
            <ShieldCheck className="text-secondary-foreground" />
            <p className="text-sm leading-relaxed text-secondary-foreground">
              Secrets are managed in project environment variables. Env vars alone are not enough —
              uvicorn must be running behind an active rc-tunnel, or frp returns an HTML 404 for every
              upload/render request.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
