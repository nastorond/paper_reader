#!/bin/bash
cd "$(dirname "$0")"

echo "Starting Portable Paper Reader..."

if [ ! -d "venv" ]; then
    echo "First time setup: Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

python src/main.py
