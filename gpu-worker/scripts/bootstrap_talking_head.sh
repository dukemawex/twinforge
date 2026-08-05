#!/usr/bin/env bash
# Bootstrap Wav2Lip + checkpoints for TwinForge talking-head / lip-sync.
# Run on the Anrui / RunPod box inside the gpu-worker venv.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TH="$ROOT/talking_head"
W2L="$TH/Wav2Lip"
CKPT_DIR="$TH/checkpoints"
mkdir -p "$CKPT_DIR"

echo "==> TwinForge talking-head bootstrap"
echo "    root: $ROOT"

if [[ ! -d "$W2L/.git" ]]; then
  echo "==> Cloning Wav2Lip"
  rm -rf "$W2L"
  git clone --depth 1 https://github.com/Rudrabha/Wav2Lip.git "$W2L"
else
  echo "==> Wav2Lip already present"
fi

download() {
  local url="$1"
  local dest="$2"
  local size
  size=$(stat -c%s "$dest" 2>/dev/null || echo 0)
  if [[ -f "$dest" && "$size" -gt 1000000 ]]; then
    echo "    skip $(basename "$dest") (already downloaded)"
    return 0
  fi
  echo "    downloading $(basename "$dest")"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 -o "$dest.partial" "$url"
  else
    wget -O "$dest.partial" "$url"
  fi
  mv "$dest.partial" "$dest"
}

echo "==> Downloading checkpoints (Hugging Face / upstream mirrors)"
download \
  "https://huggingface.co/numz/wav2lip_studio/resolve/main/Wav2lip/wav2lip_gan.pth" \
  "$CKPT_DIR/wav2lip_gan.pth"

FACE_DET_DIR="$W2L/face_detection/detection/sfd"
mkdir -p "$FACE_DET_DIR"
download \
  "https://www.adrianbulat.com/downloads/python-fan/s3fd-619a316812.pth" \
  "$FACE_DET_DIR/s3fd.pth"

echo "==> Installing Python deps for Wav2Lip"
if [[ -x "$ROOT/.venv/bin/pip" ]]; then
  PIP="$ROOT/.venv/bin/pip"
elif [[ -n "${VIRTUAL_ENV:-}" && -x "$VIRTUAL_ENV/bin/pip" ]]; then
  PIP="$VIRTUAL_ENV/bin/pip"
else
  PIP="pip"
fi
"$PIP" install -q --upgrade pip
"$PIP" install -q -r "$ROOT/requirements-talking-head.txt"

echo "==> Verifying"
cd "$ROOT"
python - <<'PY'
from talking_head import status
s = status()
print(s)
if not s["ready"]:
    raise SystemExit("bootstrap incomplete — checkpoint or face detector missing")
print("talking-head ready")
PY

echo ""
echo "Done. Restart uvicorn, then Retry a job in TwinForge."
echo "  pkill -f 'uvicorn main:app' || true"
echo "  source .venv/bin/activate && uvicorn main:app --host 127.0.0.1 --port 8081"
