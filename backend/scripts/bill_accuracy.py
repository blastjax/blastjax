#!/usr/bin/env python3
"""
How well PDF reading does on the bills already saved, field by field: with the generic rules alone, and after
learning from the same biller's other saved bills (a bill never learns from itself). Read-only.

Usage (from the repo root, with the venv active):

    python backend/scripts/bill_accuracy.py
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FIELDS = ("bill_date", "due_date", "period_start", "period_end", "amount")


def main() -> int:
    import db
    from app.services.bill_extract import UnreadablePdf, fields_from_text, learn, pdf_text

    data = db.list_bills()
    names = {c["id"]: c["name"] for c in data["categories"]}
    texts = {}
    for b in data["bills"]:
        pdf = db.get_bill_pdf(b["id"]) if b["has_pdf"] else None
        if pdf and pdf.startswith(b"%PDF"):
            try:
                texts[b["id"]] = pdf_text(pdf)
            except UnreadablePdf as exc:
                print(f"bill {b['id']}: {exc}")
    right = {"generic": Counter(), "learned": Counter()}
    for b in data["bills"]:
        if b["id"] not in texts:
            continue
        others = [
            (texts[o["id"]], o)
            for o in data["bills"]
            if o["category_id"] == b["category_id"] and o["id"] != b["id"] and o["id"] in texts
        ]
        for mode, hints in (("generic", None), ("learned", learn(others))):
            got = fields_from_text(texts[b["id"]], hints)
            right[mode].update(f for f in FIELDS if got[f] == b[f])
            if mode == "learned":
                wrong = ", ".join(f"{f} read {got[f]} (saved {b[f]})" for f in FIELDS if got[f] != b[f])
                print(f"{names[b['category_id']]} bill {b['id']} ({b['bill_date']}): {wrong or 'all right'}")
    for mode, counts in right.items():
        print(f"{mode:>8}: " + "  ".join(f"{f} {counts[f]}/{len(texts)}" for f in FIELDS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
