"""
TwinForge GPU worker for Anrui / RunPod / any ROCm box.

Accepts jobs from TwinForge at POST /jobs, renders a captioned video with ffmpeg,
and reports progress to TwinForge's HMAC webhook.

Run on Anrui:
  pip install -r requirements.txt
  export GPU_API_KEY=... GPU_WEBHOOK_SECRET=... WORKER_PUBLIC_URL=https://rc-....radeon.firstdg.ai
  uvicorn main:app --host 127.0.0.1 --port 8081
  rc-tunnel expose --port 8081

Then set Vercel:
  GPU_API_BASE_URL=<WORKER_PUBLIC_URL>
  GPU_API_KEY=<same>
  GPU_API_URL=<same as BASE>
  GPU_API_TOKEN=<same as KEY>
  GPU_WEBHOOK_SECRET=<same>
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import shutil
import subprocess
import textwrap
from pathlib import Path
from typing import Any

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

app = FastAPI(title="TwinForge GPU Worker", version="1.0.0")
ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "outputs"
WORK_DIR = ROOT / "work"
OUTPUT_DIR.mkdir(exist_ok=True)
WORK_DIR.mkdir(exist_ok=True)

API_KEY = os.environ.get("GPU_API_KEY") or os.environ.get("GPU_API_TOKEN") or ""
WEBHOOK_SECRET = os.environ.get("GPU_WEBHOOK_SECRET") or ""
PUBLIC_URL = (os.environ.get("WORKER_PUBLIC_URL") or os.environ.get("PUBLIC_URL") or "").rstrip("/")
VLLM_BASE_URL = (os.environ.get("VLLM_BASE_URL") or "").rstrip("/")
VLLM_API_KEY = os.environ.get("VLLM_API_KEY") or "EMPTY"
VLLM_MODEL = os.environ.get("VLLM_MODEL") or "Qwen/Qwen2.5-7B-Instruct"

app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")


class AssetRef(BaseModel):
    id: str | None = None
    kind: str | None = None
    contentType: str | None = None
    url: str | None = None


class JobRequest(BaseModel):
    jobId: str
    kind: str = "video"
    payload: dict[str, Any] = Field(default_factory=dict)
    twin: dict[str, Any] | None = None
    assets: dict[str, AssetRef | None] = Field(default_factory=dict)
    callbackUrl: str
    assetAuthHeader: str | None = None


def require_auth(authorization: str | None = Header(default=None)) -> None:
    if not API_KEY:
        return
    token = (authorization or "").removeprefix("Bearer ").strip()
    if token != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


def sign(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()


async def post_webhook(callback_url: str, payload: dict[str, Any]) -> None:
    if not WEBHOOK_SECRET:
        print("GPU_WEBHOOK_SECRET missing; skipping webhook", flush=True)
        return
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {
        "content-type": "application/json",
        "x-twinforge-signature": sign(raw),
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(callback_url, content=raw, headers=headers)
        response.raise_for_status()


def resolution_size(resolution: str, aspect: str) -> tuple[int, int]:
    height = {"720p": 720, "1080p": 1080, "4k": 2160}.get(resolution, 1080)
    if aspect == "9:16":
        return int(height * 9 / 16), height
    if aspect == "1:1":
        return height, height
    return int(height * 16 / 9), height


async def maybe_polish_script(script: str) -> str:
    if not VLLM_BASE_URL:
        return script
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{VLLM_BASE_URL}/chat/completions",
                headers={
                    "authorization": f"Bearer {VLLM_API_KEY}",
                    "content-type": "application/json",
                },
                json={
                    "model": VLLM_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": "Tighten the presenter script for spoken delivery. Keep meaning. Return only the script.",
                        },
                        {"role": "user", "content": script},
                    ],
                    "temperature": 0.4,
                    "max_tokens": 1200,
                },
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"].strip()
            return content or script
    except Exception as exc:  # noqa: BLE001
        print(f"vLLM polish skipped: {exc}", flush=True)
        return script


async def download_asset(asset: AssetRef | None, auth_header: str | None, dest: Path) -> Path | None:
    if not asset or not asset.url:
        return None
    headers = {}
    if auth_header:
        headers["authorization"] = auth_header
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        response = await client.get(asset.url, headers=headers)
        response.raise_for_status()
        dest.write_bytes(response.content)
    return dest


def burn_captions(script: str, width: int) -> str:
    wrapped = textwrap.fill(script[:500], width=max(24, width // 28))
    escaped = (
        wrapped.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
    )
    fontsize = max(28, width // 28)
    return (
        f"drawtext=text='{escaped}':fontcolor=white:fontsize={fontsize}:"
        f"box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=h-text_h-80"
    )


def render_ffmpeg(
    *,
    image_path: Path | None,
    title: str,
    script: str,
    width: int,
    height: int,
    duration: int,
    out_path: Path,
) -> None:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required on the GPU worker host")

    filter_complex = burn_captions(f"{title}\\n\\n{script}", width)
    cmd: list[str]
    if image_path and image_path.exists():
        cmd = [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-i",
            str(image_path),
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-vf",
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,"
            f"{filter_complex}",
            "-t",
            str(duration),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(out_path),
        ]
    else:
        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=#0b1220:s={width}x{height}:d={duration}",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-vf",
            filter_complex,
            "-t",
            str(duration),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(out_path),
        ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-2000:] or "ffmpeg failed")


async def process_job(job: JobRequest) -> None:
    job_dir = WORK_DIR / job.jobId
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        await post_webhook(
            job.callbackUrl,
            {"jobId": job.jobId, "status": "processing", "progress": 10, "stage": "accepted"},
        )

        payload = job.payload or {}
        title = str(payload.get("title") or "TwinForge production")
        script = str(payload.get("script") or "")
        aspect = str(payload.get("aspectRatio") or "16:9")
        resolution = str(payload.get("resolution") or "1080p")
        width, height = resolution_size(resolution, aspect)
        duration = max(8, min(45, max(1, len(script.split()) // 2)))

        await post_webhook(
            job.callbackUrl,
            {"jobId": job.jobId, "status": "processing", "progress": 25, "stage": "script"},
        )
        polished = await maybe_polish_script(script)

        photo = job.assets.get("photo") if isinstance(job.assets, dict) else None
        reference = job.assets.get("reference") if isinstance(job.assets, dict) else None
        image_asset = photo or reference
        image_path = await download_asset(
            image_asset if isinstance(image_asset, AssetRef) else None,
            job.assetAuthHeader,
            job_dir / "source.bin",
        )

        await post_webhook(
            job.callbackUrl,
            {"jobId": job.jobId, "status": "processing", "progress": 55, "stage": "rendering"},
        )

        out_name = f"{job.jobId}.mp4"
        out_path = OUTPUT_DIR / out_name
        await asyncio.to_thread(
            render_ffmpeg,
            image_path=image_path,
            title=title,
            script=polished,
            width=width,
            height=height,
            duration=duration,
            out_path=out_path,
        )

        if not PUBLIC_URL:
            raise RuntimeError("WORKER_PUBLIC_URL is required so TwinForge can fetch the output")

        output_url = f"{PUBLIC_URL}/outputs/{out_name}"
        await post_webhook(
            job.callbackUrl,
            {
                "jobId": job.jobId,
                "status": "completed",
                "progress": 100,
                "stage": "completed",
                "outputUrl": output_url,
                "durationSeconds": duration,
            },
        )
    except Exception as exc:  # noqa: BLE001
        await post_webhook(
            job.callbackUrl,
            {
                "jobId": job.jobId,
                "status": "failed",
                "progress": 100,
                "stage": "failed",
                "error": str(exc)[:1000],
            },
        )


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "publicUrl": PUBLIC_URL or None,
        "vllm": bool(VLLM_BASE_URL),
        "authRequired": bool(API_KEY),
    }


@app.post("/jobs")
async def create_job(
    job: JobRequest,
    background: BackgroundTasks,
    _: None = Depends(require_auth),
) -> dict[str, str]:
    if not job.callbackUrl:
        raise HTTPException(status_code=400, detail="callbackUrl required")
    background.add_task(process_job, job)
    return {"id": job.jobId, "jobId": job.jobId}


@app.get("/outputs/{name}")
async def get_output(name: str) -> FileResponse:
    path = OUTPUT_DIR / Path(name).name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type="video/mp4")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8081")),
        reload=False,
    )
