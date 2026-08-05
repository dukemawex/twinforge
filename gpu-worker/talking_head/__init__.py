"""
Talking-head / lip-sync for TwinForge GPU worker.

Uses a local Wav2Lip install (bootstrapped under talking_head/Wav2Lip) to drive
mouth motion from TTS audio. Works with a portrait photo or a reference video.

This is the real lip-sync path. If checkpoints are missing, callers should fall
back to the ffmpeg motion+TTS compositor in main.py.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORKER_ROOT = ROOT.parent
WAV2LIP_DIR = ROOT / "Wav2Lip"
CHECKPOINT = ROOT / "checkpoints" / "wav2lip_gan.pth"
FACE_DET = WAV2LIP_DIR / "face_detection" / "detection" / "sfd" / "s3fd.pth"


def lipsync_ready() -> bool:
    return (
        WAV2LIP_DIR.is_dir()
        and (WAV2LIP_DIR / "inference.py").is_file()
        and CHECKPOINT.is_file()
        and CHECKPOINT.stat().st_size > 1_000_000
        and FACE_DET.is_file()
    )


def status() -> dict:
    torch_ok = False
    device = "cpu"
    try:
        import torch

        torch_ok = True
        if torch.cuda.is_available():
            device = "cuda"
    except Exception:  # noqa: BLE001
        pass
    return {
        "ready": lipsync_ready(),
        "wav2lip": WAV2LIP_DIR.is_dir(),
        "checkpoint": CHECKPOINT.is_file(),
        "faceDetector": FACE_DET.is_file(),
        "torch": torch_ok,
        "device": device,
    }


def _run(cmd: list[str], *, cwd: Path | None = None, env: dict | None = None) -> None:
    merged = os.environ.copy()
    if env:
        merged.update(env)
    proc = subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=merged, capture_output=True, text=True)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "command failed").strip()
        raise RuntimeError(err[-1200:])


def prepare_face_clip(
    media_path: Path,
    *,
    is_video: bool,
    duration: float,
    work_dir: Path,
    max_side: int = 720,
) -> Path:
    """Normalize face media for Wav2Lip: loop video to speech length, or keep image."""
    work_dir.mkdir(parents=True, exist_ok=True)
    if not is_video:
        # Wav2Lip accepts a still directly (static face mode).
        dest = work_dir / f"face{media_path.suffix.lower() or '.jpg'}"
        if media_path.resolve() != dest.resolve():
            shutil.copy2(media_path, dest)
        return dest

    dest = work_dir / "face_loop.mp4"
    # Cover-scale to max_side on the long edge for ROCm VRAM headroom.
    vf = (
        f"scale='if(gt(iw,ih),min({max_side},iw),-2)':'if(gt(ih,iw),min({max_side},ih),-2)',"
        "fps=25,format=yuv420p"
    )
    _run(
        [
            "ffmpeg",
            "-y",
            "-stream_loop",
            "-1",
            "-i",
            str(media_path),
            "-t",
            f"{max(1.0, duration):.2f}",
            "-vf",
            vf,
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            str(dest),
        ]
    )
    return dest


def prepare_audio_wav(speech_path: Path, work_dir: Path) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    dest = work_dir / "speech_16k.wav"
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(speech_path),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(dest),
        ]
    )
    return dest


def run_wav2lip(
    *,
    face_path: Path,
    audio_wav: Path,
    outfile: Path,
    static_image: bool,
) -> Path:
    if not lipsync_ready():
        raise RuntimeError(
            "Talking-head models are not installed. "
            "Run: bash scripts/bootstrap_talking_head.sh"
        )

    outfile.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = WAV2LIP_DIR / "temp"
    temp_dir.mkdir(exist_ok=True)
    results_dir = WAV2LIP_DIR / "results"
    results_dir.mkdir(exist_ok=True)

    # Inference writes relative paths under the Wav2Lip cwd.
    local_out = results_dir / outfile.name
    cmd = [
        sys.executable,
        "inference.py",
        "--checkpoint_path",
        str(CHECKPOINT),
        "--face",
        str(face_path.resolve()),
        "--audio",
        str(audio_wav.resolve()),
        "--outfile",
        str(local_out),
        "--fps",
        "25",
        "--pads",
        "0",
        "15",
        "0",
        "0",
        "--face_det_batch_size",
        "4",
        "--wav2lip_batch_size",
        "32",
        "--resize_factor",
        "1",
    ]
    if static_image:
        # inference.py treats bool argparse oddly; pass a true-ish value via env workaround
        # by ensuring face path is an image extension (jpg/png) which forces static=True.
        pass

    env = {
        "PYTHONPATH": str(WAV2LIP_DIR),
    }
    _run(cmd, cwd=WAV2LIP_DIR, env=env)
    if not local_out.exists() or local_out.stat().st_size < 1000:
        raise RuntimeError("Wav2Lip finished without producing an output video")
    if local_out.resolve() != outfile.resolve():
        shutil.copy2(local_out, outfile)
    return outfile


def animate_talking_head(
    *,
    media_path: Path,
    media_is_video: bool,
    speech_path: Path,
    duration: float,
    work_dir: Path,
    outfile: Path,
) -> Path:
    """Full lip-sync pass: prepare inputs → Wav2Lip → MP4 with speech audio."""
    face = prepare_face_clip(
        media_path,
        is_video=media_is_video,
        duration=duration,
        work_dir=work_dir / "face",
    )
    audio = prepare_audio_wav(speech_path, work_dir / "audio")
    static = not media_is_video
    raw = work_dir / "lipsync_raw.mp4"
    run_wav2lip(face_path=face, audio_wav=audio, outfile=raw, static_image=static)

    # Ensure AAC + exact speech mux (Wav2Lip already muxes audio, but normalize).
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(raw),
            "-i",
            str(speech_path),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(outfile),
        ]
    )
    return outfile
