"""
TwinForge GPU worker for Anrui / RunPod / any ROCm box.

Accepts jobs from TwinForge at POST /jobs, renders a captioned video with ffmpeg,
and reports progress two ways: a best-effort HMAC webhook, and durable on-disk
job state that TwinForge can poll at GET /jobs/{id}.

Polling is authoritative. Networks that block the TwinForge host outbound (for
example a GPU box behind a national firewall) still work, because every call is
then initiated by TwinForge inbound over the tunnel.

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
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

app = FastAPI(title="TwinForge GPU Worker", version="1.1.0")
ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "outputs"
WORK_DIR = ROOT / "work"
STATE_DIR = ROOT / "state"
OUTPUT_DIR.mkdir(exist_ok=True)
WORK_DIR.mkdir(exist_ok=True)
STATE_DIR.mkdir(exist_ok=True)

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
    callbackUrl: str | None = None
    assetAuthHeader: str | None = None


def require_auth(authorization: str | None = Header(default=None)) -> None:
    if not API_KEY:
        return
    token = (authorization or "").removeprefix("Bearer ").strip()
    if token != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


def sign(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()


def state_path(job_id: str) -> Path:
    return STATE_DIR / f"{Path(job_id).name}.json"


def read_state(job_id: str) -> dict[str, Any] | None:
    path = state_path(job_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:  # noqa: BLE001
        return None


def write_state(job_id: str, payload: dict[str, Any]) -> None:
    """Persist job state atomically so a restart or crash cannot lose it."""
    current = read_state(job_id) or {"jobId": job_id}
    current.update(payload)
    current["updatedAt"] = time.time()
    tmp = state_path(job_id).with_suffix(".tmp")
    tmp.write_text(json.dumps(current))
    tmp.replace(state_path(job_id))


async def post_webhook(callback_url: str | None, payload: dict[str, Any]) -> None:
    """Best effort only. A webhook that cannot be delivered must never fail a render."""
    if not callback_url:
        return
    if not WEBHOOK_SECRET:
        print("GPU_WEBHOOK_SECRET missing; skipping webhook", flush=True)
        return
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {
        "content-type": "application/json",
        "x-twinforge-signature": sign(raw),
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(callback_url, content=raw, headers=headers)
            response.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        print(f"webhook delivery failed (state still recorded): {exc}", flush=True)


async def report(job: JobRequest, payload: dict[str, Any]) -> None:
    """Record state first, then try to push. Polling is the source of truth."""
    write_state(job.jobId, payload)
    await post_webhook(job.callbackUrl, {"jobId": job.jobId, **payload})


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
    """Pull a job asset to disk.

    Large reference clips (~50MB+) used to fail mid-transfer with httpx
    IncompleteRead ("peer closed connection… received X, expected Y") because
    we buffered the whole body and used a short timeout. Stream to disk and
    retry transient disconnects. Presigned Blob URLs must not get our Bearer
    token — that header is only for the TwinForge asset proxy fallback.
    """
    if not asset or not asset.url:
        return None

    headers: dict[str, str] = {}
    host = ""
    try:
        host = httpx.URL(asset.url).host or ""
    except Exception:  # noqa: BLE001
        host = ""
    # Only the app proxy needs TwinForge auth. Blob / CDN signed URLs do not.
    if auth_header and (
        host.endswith(".vercel.app")
        or host in {"localhost", "127.0.0.1"}
        or "/api/worker/assets/" in asset.url
    ):
        headers["authorization"] = auth_header

    timeout = httpx.Timeout(connect=30.0, read=600.0, write=60.0, pool=30.0)
    last_error: Exception | None = None

    for attempt in range(1, 4):
        tmp = dest.with_suffix(f"{dest.suffix}.part")
        try:
            if tmp.exists():
                tmp.unlink()
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                async with client.stream("GET", asset.url, headers=headers) as response:
                    response.raise_for_status()
                    expected = response.headers.get("content-length")
                    expected_n = int(expected) if expected and expected.isdigit() else None
                    written = 0
                    with tmp.open("wb") as handle:
                        async for chunk in response.aiter_bytes(chunk_size=1024 * 256):
                            handle.write(chunk)
                            written += len(chunk)
                    if expected_n is not None and written != expected_n:
                        raise httpx.RemoteProtocolError(
                            f"incomplete download (received {written} bytes, expected {expected_n})"
                        )
                    if written == 0:
                        raise RuntimeError("Downloaded asset was empty")
            tmp.replace(dest)
            return dest
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if tmp.exists():
                tmp.unlink(missing_ok=True)
            print(f"asset download attempt {attempt}/3 failed: {exc}", flush=True)
            if attempt < 3:
                await asyncio.sleep(1.5 * attempt)

    raise RuntimeError(f"Could not download asset after 3 attempts: {last_error}")


def burn_captions(script: str, width: int, fontfile: str | None = None) -> str:
    wrapped = textwrap.fill(script[:500], width=max(24, width // 28))
    escaped = (
        wrapped.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
    )
    fontsize = max(28, width // 28)
    font_opt = f"fontfile={fontfile}:" if fontfile else ""
    return (
        f"drawtext={font_opt}text='{escaped}':fontcolor=white:fontsize={fontsize}:"
        f"box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=h-text_h-80"
    )


def find_font() -> str | None:
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ):
        if Path(candidate).exists():
            return candidate
    return None


def extension_for_content_type(content_type: str | None) -> str:
    mapping = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
    }
    if not content_type:
        return ".bin"
    return mapping.get(content_type.split(";")[0].strip().lower(), ".bin")


def ffmpeg_error_tail(stderr: str, limit: int = 800) -> str:
    """Keep the useful end of ffmpeg logs (banner/config is huge and useless)."""
    text = (stderr or "").strip()
    if not text:
        return "ffmpeg failed"
    # Prefer lines that look like real failures.
    lines = [ln for ln in text.splitlines() if ln.strip()]
    interesting = [
        ln
        for ln in lines
        if any(
            key in ln.lower()
            for key in ("error", "invalid", "failed", "cannot", "no such", "unknown", "not found")
        )
    ]
    chosen = "\n".join(interesting[-12:] if interesting else lines[-12:])
    return chosen[-limit:]


def run_ffmpeg(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(ffmpeg_error_tail(proc.stderr))


def prepare_still_frame(source: Path, dest: Path) -> Path:
    """Turn a photo or reference video into one JPEG still for captioned output.

    Reference twins upload MP4/MOV clips, but the renderer loops a still. Feeding
    a video to `-loop 1` (image mode) is what produced the opaque ffmpeg banner
    failures in the library.
    """
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required on the GPU worker host")
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        str(dest),
    ]
    run_ffmpeg(cmd)
    if not dest.exists() or dest.stat().st_size == 0:
        raise RuntimeError("Could not extract a still frame from the uploaded media")
    return dest


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

    font = find_font()
    filter_complex = burn_captions(f"{title}\\n\\n{script}", width, font)
    still: Path | None = None
    if image_path and image_path.exists():
        still = image_path.with_name("still.jpg")
        prepare_still_frame(image_path, still)

    if still and still.exists():
        cmd = [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-i",
            str(still),
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

    run_ffmpeg(cmd)


async def process_job(job: JobRequest) -> None:
    job_dir = WORK_DIR / job.jobId
    job_dir.mkdir(parents=True, exist_ok=True)
    try:
        await report(
            job, {"status": "processing", "progress": 10, "stage": "accepted"}
        )

        payload = job.payload or {}
        title = str(payload.get("title") or "TwinForge production")
        script = str(payload.get("script") or "")
        aspect = str(payload.get("aspectRatio") or "16:9")
        resolution = str(payload.get("resolution") or "1080p")
        width, height = resolution_size(resolution, aspect)
        duration = max(8, min(45, max(1, len(script.split()) // 2)))

        await report(
            job, {"status": "processing", "progress": 25, "stage": "script"}
        )
        polished = await maybe_polish_script(script)

        photo = job.assets.get("photo") if isinstance(job.assets, dict) else None
        reference = job.assets.get("reference") if isinstance(job.assets, dict) else None
        image_asset = photo or reference
        await report(
            job, {"status": "processing", "progress": 40, "stage": "assets"}
        )
        ext = ".bin"
        if isinstance(image_asset, AssetRef):
            ext = extension_for_content_type(image_asset.contentType)
        image_path = await download_asset(
            image_asset if isinstance(image_asset, AssetRef) else None,
            job.assetAuthHeader,
            job_dir / f"source{ext}",
        )

        await report(
            job, {"status": "processing", "progress": 55, "stage": "rendering"}
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

        output_url = f"{PUBLIC_URL}/outputs/{out_name}" if PUBLIC_URL else None
        await report(
            job,
            {
                "status": "completed",
                "progress": 100,
                "stage": "completed",
                "outputName": out_name,
                "outputUrl": output_url,
                "durationSeconds": duration,
                "error": None,
            },
        )
    except Exception as exc:  # noqa: BLE001
        print(f"job {job.jobId} failed: {exc}", flush=True)
        # Keep the tail — ffmpeg banners are long and used to hide the real error.
        message = str(exc)
        await report(
            job,
            {
                "status": "failed",
                "progress": 100,
                "stage": "failed",
                "error": message[-1000:] if len(message) > 1000 else message,
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
        "polling": True,
    }


@app.post("/jobs")
async def create_job(
    job: JobRequest,
    background: BackgroundTasks,
    _: None = Depends(require_auth),
) -> dict[str, str]:
    write_state(job.jobId, {"status": "queued", "progress": 0, "stage": "accepted", "error": None})
    background.add_task(process_job, job)
    return {"id": job.jobId, "jobId": job.jobId}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str, _: None = Depends(require_auth)) -> dict[str, Any]:
    """Authoritative job state. TwinForge polls this instead of relying on webhooks."""
    state = read_state(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Unknown job")
    name = state.get("outputName")
    state["outputReady"] = bool(name and (OUTPUT_DIR / str(name)).exists())
    return state


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
