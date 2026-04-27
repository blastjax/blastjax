"""Payslip API models."""

from __future__ import annotations

from pydantic import AliasChoices, BaseModel, Field


class PayslipCreate(BaseModel):
    total: float | None = None
    commission: float | None = None
    reimbursement: float | None = None
    medical_reimbursement: float | None = None
    others: float | None = None
    mp2: float | None = None
    allowances: float | None = None
    thirteenth_month: float | None = None
    basic_salary: float | None = None
    period_year: int | None = Field(default=None, ge=1900, le=2200)
    period_month: int | None = Field(default=None, ge=1, le=12)
    period_half: int | None = Field(default=None, ge=1, le=2)
    notes: str | None = None
    withholding_tax: float | None = None
    sss_contribution: float | None = None
    philhealth: float | None = None
    pag_ibig: float | None = Field(
        default=None,
        validation_alias=AliasChoices("pag_ibig", "employee_hdmf"),
    )
