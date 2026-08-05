# TwinForge GPU worker (Anrui / RunPod)

This worker is what TwinForge actually calls. Point Vercel at **this worker**, not the raw Anrui gallery or a plain vLLM `/v1` URL.

## Anrui setup

1. Launch a **Blank OpenCode / ROCm** workspace on https://radeon-global.anruicloud.com/
2. Open Notebook → Terminal
3. Upload or clone this `gpu-worker` folder
4. Install and run:

```bash
cd gpu-worker
pip install -r requirements.txt
# ffmpeg is usually present; if not: sudo apt-get update && sudo apt-get install -y ffmpeg

export GPU_API_KEY="$(openssl rand -hex 24)"
export GPU_WEBHOOK_SECRET="$(openssl rand -hex 32)"
export WORKER_PUBLIC_URL=""   # set after tunnel starts
export PORT=8081

# optional: polish scripts with a local/sibling vLLM endpoint
# export VLLM_BASE_URL="http://127.0.0.1:8000/v1"
# export VLLM_MODEL="Qwen/Qwen2.5-7B-Instruct"

uvicorn main:app --host 127.0.0.1 --port 8081
```

5. In another terminal, expose the port:

```bash
/var/run/secrets/frp-self-service/install
rc-tunnel expose --port 8081
```

6. Copy the returned URL (e.g. `https://rc-….radeon.firstdg.ai`) into `WORKER_PUBLIC_URL`, restart uvicorn, then set Vercel:

| Vercel env | Value |
|---|---|
| `GPU_API_BASE_URL` | tunnel URL |
| `GPU_API_URL` | same |
| `GPU_API_KEY` | same as worker `GPU_API_KEY` |
| `GPU_API_TOKEN` | same |
| `GPU_WEBHOOK_SECRET` | same as worker `GPU_WEBHOOK_SECRET` |

7. Redeploy TwinForge. New productions leave `awaiting_gpu` and move to `processing` → `completed`.

## API

- `GET /health`
- `POST /jobs` (Bearer `GPU_API_KEY`)
- `GET /jobs/{id}` (polling — authoritative when webhooks cannot reach TwinForge)
- `GET /outputs/<jobId>.mp4`

## Troubleshooting: HTML “Not Found” / frp page

If TwinForge shows an error that looks like:

> The page you requested was not found… The server is powered by frp.

then `GPU_API_BASE_URL` is an **rc-tunnel URL whose backend is down**. frp answers the HTTPS request, but uvicorn is not listening (or the tunnel was never started).

Fix on the pod:

```bash
cd /workspace/gpu-worker   # or wherever you installed
source .venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8081
# other terminal:
rc-tunnel expose --port 8081
```

Then set Vercel `GPU_API_BASE_URL` to the printed `https://rc-….radeon.firstdg.ai` URL and redeploy.

Do **not** use `https://radeon-global.anruicloud.com/` or a `/spaces/.../v1` chat URL.

## Troubleshooting: incomplete asset download

If a job fails with:

> peer closed connection without sending complete message body (received … expected …)

the worker reached Blob storage but the ~50MB+ reference clip was cut mid-transfer.
Current `main.py` streams the file and retries 3 times — restart uvicorn after updating
the worker files so that fix is loaded.

## Troubleshooting: ffmpeg copyright / configuration dump

If the library shows a wall of ffmpeg build flags, the real error was truncated.
Current worker extracts a still frame from reference **videos** (twins upload
MP4/MOV, not only photos) before captioning, and keeps the useful tail of
ffmpeg errors. Restart uvicorn after updating `main.py`.

## Output quality (v1.3)

The worker now:
- keeps **motion** from reference videos (loops/trims to speech length)
- adds a slow **Ken Burns zoom** on photos
- **cover-crops** to fill the frame (no black letterbox bars)
- synthesizes **spoken audio** with `edge-tts` (espeak fallback)

This is still not full lip-sync / avatar animation — that needs a dedicated talking-head model.
