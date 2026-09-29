from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field, field_validator


class LottoNumbers(BaseModel):
    numbers: list[int] = Field(min_length=6, max_length=6)

    @field_validator("numbers")
    @classmethod
    def _check_numbers(cls, v: list[int]) -> list[int]:
        if any(n < 1 or n > 58 for n in v):
            raise ValueError("Numbers must be between 1 and 58.")
        if len(set(v)) != len(v):
            raise ValueError("Numbers must be unique.")
        return sorted(v)


class LottoDrawCreate(BaseModel):
    game_id: int = Field(..., gt=0)
    draw_date: dt.date
    numbers: list[int] | None = None
    jackpot_prize: float | None = None
    winners: int = 0

    @field_validator("numbers")
    @classmethod
    def _check_numbers(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return None
        if len(v) != 6:
            raise ValueError("Enter exactly 6 numbers, or leave blank until the result is known.")
        if any(n < 1 or n > 58 for n in v):
            raise ValueError("Numbers must be between 1 and 58.")
        if len(set(v)) != len(v):
            raise ValueError("Numbers must be unique.")
        return sorted(v)

    @field_validator("jackpot_prize")
    @classmethod
    def _check_jackpot(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Jackpot prize must be zero or greater.")
        return v

    @field_validator("winners")
    @classmethod
    def _check_winners(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Winners must be zero or greater.")
        return v


class LottoAttemptCreate(LottoNumbers):
    ticket: int | None = None


class LottoAttemptsBulkCreate(BaseModel):
    attempts: list[LottoAttemptCreate] = Field(min_length=1)


class LottoImportText(BaseModel):
    game_id: int = Field(..., gt=0)
    text: str
