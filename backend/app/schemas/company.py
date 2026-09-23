"""Company management API models (Settings → Companies). See app/routers/company.py."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

# Every per-company column-visibility toggle. Keep this in sync with
# db._COMPANY_FLAG_COLUMNS -- income-side fields first (the main grid in
# PayslipFormFields), then deduction-side fields (the "Deductions" aside).
# All default to shown (matches every column's behavior before this toggle
# existed).
_FLAG_DEFAULTS: dict[str, bool] = {
    "show_total": True,
    "show_basic_salary": True,
    "show_commission": True,
    "show_reimbursement": True,
    "show_medical_reimbursement": True,
    "show_others": True,
    "show_allowances": True,
    "show_thirteenth_month": True,
    "show_withholding_tax": True,
    "show_sss_contribution": True,
    "show_philhealth": True,
    "show_pag_ibig": True,
    "show_mp2": True,
}


class _CompanyColumnFlags(BaseModel):
    show_total: bool = _FLAG_DEFAULTS["show_total"]
    show_basic_salary: bool = _FLAG_DEFAULTS["show_basic_salary"]
    show_commission: bool = _FLAG_DEFAULTS["show_commission"]
    show_reimbursement: bool = _FLAG_DEFAULTS["show_reimbursement"]
    show_medical_reimbursement: bool = _FLAG_DEFAULTS["show_medical_reimbursement"]
    show_others: bool = _FLAG_DEFAULTS["show_others"]
    show_allowances: bool = _FLAG_DEFAULTS["show_allowances"]
    show_thirteenth_month: bool = _FLAG_DEFAULTS["show_thirteenth_month"]
    show_withholding_tax: bool = _FLAG_DEFAULTS["show_withholding_tax"]
    show_sss_contribution: bool = _FLAG_DEFAULTS["show_sss_contribution"]
    show_philhealth: bool = _FLAG_DEFAULTS["show_philhealth"]
    show_pag_ibig: bool = _FLAG_DEFAULTS["show_pag_ibig"]
    show_mp2: bool = _FLAG_DEFAULTS["show_mp2"]

    def flags_dict(self) -> dict[str, bool]:
        """This model's flags, keyed by column name -- ``db.insert_company``/
        ``update_company``'s ``flags`` argument."""
        return {k: getattr(self, k) for k in _FLAG_DEFAULTS}


class CompanyCreate(_CompanyColumnFlags):
    name: str = Field(..., min_length=1, max_length=100)

    @model_validator(mode="after")
    def _check_name(self) -> "CompanyCreate":
        if not self.name.strip():
            raise ValueError("Company name cannot be blank.")
        return self


class CompanyUpdate(_CompanyColumnFlags):
    name: str = Field(..., min_length=1, max_length=100)

    @model_validator(mode="after")
    def _check_name(self) -> "CompanyUpdate":
        if not self.name.strip():
            raise ValueError("Company name cannot be blank.")
        return self


class CompanyReorder(BaseModel):
    """Every company id, in the desired display order (top to bottom)."""

    ids: list[int] = Field(..., min_length=1)
