from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

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

    "show_bereavement_asst": False,
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
    show_bereavement_asst: bool = _FLAG_DEFAULTS["show_bereavement_asst"]

    def flags_dict(self) -> dict[str, bool]:
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
    ids: list[int] = Field(..., min_length=1)
