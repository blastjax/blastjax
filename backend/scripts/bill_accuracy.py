#!/usr/bin/env python3
"""
How well reading does on the bills and payslips already saved, field by field, the way the app reads them: a
known biller by its own layout, anyone else by the generic rules plus what the biller's other saved bills teach
(a bill never learns from itself). Photos are read too where Tesseract is installed. Read-only.

A mismatch is either a reading miss or a saved value that differs from what the file prints: open the file.

Usage (from the repo root, with the venv active):

    python backend/scripts/bill_accuracy.py
"""

from __future__ import annotations

import shutil
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FIELDS = ("bill_date", "due_date", "period_start", "period_end", "amount", "minimum_due")
PAYSLIP_FIELDS = (
    "period_year", "period_month", "period_half", "total", "basic_salary", "commission", "reimbursement",
    "medical_reimbursement", "others", "mp2", "allowances", "thirteenth_month", "withholding_tax",
    "sss_contribution", "philhealth", "pag_ibig", "bereavement_asst",
)  # fmt: skip


def main() -> int:
    import db
    from app.services.bill_extract import (
        UnreadablePdf,
        biller_fields,
        fields_from_text,
        image_text,
        learn,
        pdf_text,
        start_after,
    )
    from app.services.payslip_parse import payslip_from_text

    data = db.list_bills()
    names = {c["id"]: c["name"] for c in data["categories"]}
    texts, photos = {}, set()
    for b in data["bills"]:
        file = db.get_bill_pdf(b["id"]) if b["has_pdf"] else None
        if file is None or not (file.startswith(b"%PDF") or shutil.which("tesseract")):
            continue
        try:
            texts[b["id"]] = pdf_text(file) if file.startswith(b"%PDF") else image_text(file)
        except UnreadablePdf as exc:
            print(f"bill {b['id']}: {exc}")
        if not file.startswith(b"%PDF"):
            photos.add(b["id"])
    right: Counter[str] = Counter()
    for b in data["bills"]:
        if b["id"] not in texts:
            continue
        got = biller_fields(texts[b["id"]])
        if got is None:
            others = [
                (texts[o["id"]], o)
                for o in data["bills"]
                if o["category_id"] == b["category_id"] and o["id"] not in (b["id"], *photos) and o["id"] in texts
            ]
            got = fields_from_text(texts[b["id"]], learn(others))
        if got["period_start"] is None and got["period_end"] is not None:
            earlier = [o["bill_date"] for o in data["bills"] if o["category_id"] == b["category_id"]]
            previous = max((d for d in earlier if d < got["period_end"]), default=None)
            got["period_start"] = start_after(previous, got["period_end"])
        got = {"minimum_due": None, **got}
        right.update(f for f in FIELDS if got[f] == b[f])
        wrong = ", ".join(f"{f} read {got[f]} (saved {b[f]})" for f in FIELDS if got[f] != b[f])
        print(f"{names[b['category_id']]} bill {b['bill_date']}: {wrong or 'all right'}")
    print("bills: " + "  ".join(f"{f} {right[f]}/{len(texts)}" for f in FIELDS))

    slips = right_slips = 0
    for p in db.list_payslips(limit=2000):
        if (p["period_year"] or 0, p["period_month"] or 0) < (2025, 8) or not p.get("has_pdf"):
            continue  # Sophos changed its payslip layout from the first half of August 2025
        try:
            got = payslip_from_text(pdf_text(db.get_payslip_pdf(p["id"]) or b""))
        except UnreadablePdf as exc:
            print(f"payslip {p['id']}: {exc}")
            continue
        slips += 1
        period = f"{p['period_year']}-{p['period_month']:02d} half {p['period_half']}"
        if got is None:
            print(f"payslip {period}: not a layout this reads")
            continue
        wrong = [f"{f} read {got[f]} (saved {p[f]})" for f in PAYSLIP_FIELDS if (got[f] or 0) != (p[f] or 0)]
        right_slips += not wrong
        print(f"payslip {period}: {', '.join(wrong) or 'all right'}")
    print(f"payslips: {right_slips}/{slips} read exactly as saved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
