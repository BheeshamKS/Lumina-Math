#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
  echo "Creating venv..."
  python3 -m venv venv
  venv/bin/pip install -r requirements.txt
fi

source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
