"""NOT NULL on the columns every write already fills.

The API's request models require these, so no row it writes leaves them empty; the schema now says so, and the
types generated from /openapi.json can call them non-null. A null left from before would make this fail, which
stops the deploy before the new API starts (both migrations roll back together); fill or delete that row first.

Production's only nulls were 4 one-off monthly expenses from before halves existed (July 2026, no date, no half):
the app never showed or counted them, and the owner chose to delete them. Downgrading doesn't bring them back.

Revision ID: 0002
Revises: 0001
"""

from __future__ import annotations

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

REQUIRED = {
    "calendar_day_override": ("day", "amount"),
    "credit_card": ("name", "credit_limit", "last_statement_balance", "current_balance", "minimum_due", "interest_rate"),
    "credit_card_payment": ("credit_card_id", "amount", "payment_date"),
    "fixed_expense": ("period_half", "period_year", "period_month", "amount"),
    "house_payment": ("name",),
    "house_payment_entry": ("house_payment_id", "paid_on", "amount"),
    "installment": (
        "name",
        "installment_current",
        "installment_total",
        "principal",
        "payment_total",
        "start_date",
        "finish_date",
        "remaining",
        "original_total",
    ),
    "installment_line": ("installment_id", "seq", "principal", "payment_total"),
    "monthly_expense": ("name", "amount", "period_half", "period_year", "period_month", "is_recurring"),
    "pay_period_start_override": ("period_year", "period_month", "period_half", "start_date"),
}


def _set(change: str) -> None:
    for table, columns in REQUIRED.items():
        op.execute(f'ALTER TABLE "{table}" ' + ", ".join(f'ALTER COLUMN "{c}" {change}' for c in columns))


def upgrade() -> None:
    # Undated one-offs with no half: no month view lists them and the budget never deducted them.
    op.execute("DELETE FROM monthly_expense WHERE period_half IS NULL AND expense_date IS NULL AND NOT is_recurring")
    _set("SET NOT NULL")


def downgrade() -> None:
    _set("DROP NOT NULL")
