"""Paths and environment-driven defaults."""

from __future__ import annotations

import os
from pathlib import Path

# backend/app/config.py -> parent = backend, parent.parent = project root (same as legacy main.py)
ROOT = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = ROOT / "uploads"
DEFAULT_XLSX = ROOT / "2026-03-25.xlsx"
