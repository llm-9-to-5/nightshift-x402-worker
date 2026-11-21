#!/bin/bash
# Full census rerun (~50 min). Output: logs.json, analysis.json; then build census-YYYY-MM-DD.json (see night-4 transcript / analyze2.py)
set -e; cd "$(dirname "$0")"
python3 fetch_index.py && python3 probe.py && python3 scan.py 30 && python3 analyze.py && python3 analyze2.py
