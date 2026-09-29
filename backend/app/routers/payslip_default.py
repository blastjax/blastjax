from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

import cache
from app.deps import require_db
from app.schemas.payslip_default import PayslipDefaultsUpsert
from db import get_payslip_defaults, save_payslip_defaults

router = APIRouter(tags=["payslip_default"], dependencies=[Depends(require_db)])

_BUILTIN = {"mp2": "5,000.00", "allowances": "1,108.30"}


def _fallback_form(half: int) -> dict[str, Any]:
    return {
        "period_year": "",
        "period_month": "",
        "period_half": str(half),
        "total": "",
        "basic_salary": "",
        "commission": "",
        "reimbursement": "",
        "medical_reimbursement": "",
        "others": "",
        "mp2": _BUILTIN["mp2"],
        "allowances": _BUILTIN["allowances"],
        "thirteenth_month": "",
        "notes": "",
        "withholding_tax": "",
        "sss_contribution": "",
        "philhealth": "",
        "pag_ibig": "",
        "bereavement_asst": "",
    }


@router.get("/api/payslip-defaults")
def payslip_defaults_get(company: str = Query(..., min_length=1)) -> dict[str, Any]:
    key = f"payslip_default:bundle:{company}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    saved = get_payslip_defaults(company)
    result = {
        "formFirst": saved["form_first"] or _fallback_form(1),
        "formSecond": saved["form_second"] or _fallback_form(2),
        "settingsHalf": saved["settings_half"] or "first",
    }
    cache.set(key, result)
    return result


@router.put("/api/payslip-defaults")
def payslip_defaults_put(body: PayslipDefaultsUpsert) -> dict[str, Any]:
    company = body.company.strip()
    save_payslip_defaults(
        company, body.form_first.model_dump(), body.form_second.model_dump(), body.settings_half
    )
    return {
        "formFirst": {**body.form_first.model_dump(), "period_half": "1"},
        "formSecond": {**body.form_second.model_dump(), "period_half": "2"},
        "settingsHalf": body.settings_half,
    }
