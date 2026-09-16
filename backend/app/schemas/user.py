"""App user management API models (settings-only for now — see app/routers/user.py)."""

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
    """Which nav pages (hrefs from web/src/lib/nav.ts) a user can see.
    Replaces the stored set wholesale — not a partial patch like
    ``AppUserUpdate`` — since Settings → Users always submits the full
    checkbox state at once."""

    is_superuser: bool
    allowed_pages: list[str] | None = None


class AppUserVerify(BaseModel):
    """Checked against the stored hash, not used to authenticate a session —
    just lets Settings confirm a password was saved correctly. No minimum
    length: a too-short guess should come back ``valid: false``, not a 422."""

    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)
