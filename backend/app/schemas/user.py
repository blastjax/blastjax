from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class AppUserCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=200)

    @model_validator(mode="after")
    def _check_username(self) -> "AppUserCreate":
        if not self.username.strip():
            raise ValueError("Username cannot be blank.")
        return self


class AppUserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=100)
    password: str | None = Field(default=None, min_length=8, max_length=200)

    @model_validator(mode="after")
    def _check_fields(self) -> "AppUserUpdate":
        if self.username is None and self.password is None:
            raise ValueError("Provide a username and/or a password to update.")
        if self.username is not None and not self.username.strip():
            raise ValueError("Username cannot be blank.")
        return self


class AppUserAccessUpdate(BaseModel):
    is_superuser: bool
    allowed_pages: list[str] | None = None


class AppUserVerify(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)
