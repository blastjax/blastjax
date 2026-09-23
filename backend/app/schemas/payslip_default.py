"""Payslip default-template API models (Settings → Payslip defaults)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class PayslipDefaultForm(BaseModel):
    period_year: str = ""
    period_month: str = ""
    total: str = ""
    basic_salary: str = ""
    commission: str = ""
    reimbursement: str = ""
    medical_reimbursement: str = ""
    others: str = ""
    mp2: str = ""
    allowances: str = ""
    thirteenth_month: str = ""
    notes: str = ""
    withholding_tax: str = ""
    sss_contribution: str = ""
    philhealth: str = ""
    pag_ibig: str = ""


class PayslipDefaultsUpsert(BaseModel):
    company: str = Field(..., min_length=1, max_length=100)
    form_first: PayslipDefaultForm
    form_second: PayslipDefaultForm
    settings_half: Literal["first", "second"]

    @model_validator(mode="after")
    def _check_company(self) -> "PayslipDefaultsUpsert":
        if not self.company.strip():
            raise ValueError("Company cannot be blank.")
        return self
