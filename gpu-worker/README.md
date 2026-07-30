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
- `GET /outputs/<jobId>.mp4`
