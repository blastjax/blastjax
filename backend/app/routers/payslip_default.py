from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

import cache
from app.deps import require_db
from app.schemas.payslip_default import PayslipDefaultForm, PayslipDefaultsUpsert
from app.schemas.responses import PayslipDefaultsBundle
from db import get_payslip_defaults, save_payslip_defaults

router = APIRouter(tags=["payslip_default"], dependencies=[Depends(require_db)])

_BUILTIN = {"mp2": "5,000.00", "allowances": "1,108.30"}


def _fallback_form(half: int) -> dict[str, Any]:
    """What a company that never saved its defaults starts from: every field blank but the built-in two."""
    return {**PayslipDefaultForm().model_dump(), **_BUILTIN, "period_half": str(half)}


@router.get("/api/payslip-defaults", response_model=PayslipDefaultsBundle)
def payslip_defaults_get(company: str = Query(..., min_length=1)) -> dict[str, Any]:
    def load() -> dict[str, Any]:
        saved = get_payslip_defaults(company)
        return {
            "formFirst": saved["form_first"] or _fallback_form(1),
            "formSecond": saved["form_second"] or _fallback_form(2),
            "settingsHalf": saved["settings_half"] or "first",
        }

    return cache.cached(f"payslip_default:bundle:{company}", load)


@router.put("/api/payslip-defaults", response_model=PayslipDefaultsBundle)
def payslip_defaults_put(body: PayslipDefaultsUpsert) -> dict[str, Any]:
    first, second = body.form_first.model_dump(), body.form_second.model_dump()
    save_payslip_defaults(body.company.strip(), first, second, body.settings_half)
    return {
        "formFirst": {**first, "period_half": "1"},
        "formSecond": {**second, "period_half": "2"},
        "settingsHalf": body.settings_half,
    }
