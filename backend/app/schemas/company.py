from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.text import Trimmed


class CompanyCreate(BaseModel):
    name: Trimmed = Field(..., min_length=1, max_length=100)
    show_total: bool = True
    show_basic_salary: bool = True
    show_commission: bool = True
    show_reimbursement: bool = True
    show_medical_reimbursement: bool = True
    show_others: bool = True
    show_allowances: bool = True
    show_thirteenth_month: bool = True
    show_withholding_tax: bool = True
    show_sss_contribution: bool = True
    show_philhealth: bool = True
    show_pag_ibig: bool = True
    show_mp2: bool = True
    show_bereavement_asst: bool = False

    @model_validator(mode="after")
    def _check_name(self) -> "CompanyCreate":
        if not self.name:
            raise ValueError("Company name cannot be blank.")
        return self

    def flags_dict(self) -> dict[str, bool]:
        return self.model_dump(exclude={"name"})


class CompanyReorder(BaseModel):
    ids: list[UUID] = Field(..., min_length=1)
