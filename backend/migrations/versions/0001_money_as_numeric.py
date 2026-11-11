"""Money columns from double precision to numeric.

NUMERIC without a scale keeps every stored value as it reads today (the cast keeps 15 significant digits,
which drops float noise like 0.30000000000000004), and from then on SQL adds amounts exactly.
Each table is rewritten once; on a new database, where the schema sync already made them numeric, it's a no-op.

Revision ID: 0001
Revises:
"""

from __future__ import annotations

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# Frozen here rather than read from schema.py: a migration has to mean the same thing later.
MONEY = {
    "bill": ("amount", "minimum_due"),
    "calendar_day_override": ("amount", "saved"),
    "credit_card": ("credit_limit", "last_statement_balance", "current_balance", "minimum_due"),
    "credit_card_payment": ("amount",),
    "fixed_expense": ("amount",),
    "house_payment_entry": ("amount",),
    "installment": ("principal", "interest", "payment_total", "remaining", "original_total"),
    "installment_line": ("principal", "interest", "payment_total"),
    "lotto_draw": ("jackpot_prize",),
    "monthly_expense": ("amount",),
    "payslip": (
        "total",
        "commission",
        "reimbursement",
        "medical_reimbursement",
        "others",
        "mp2",
        "allowances",
        "thirteenth_month",
        "basic_salary",
        "withholding_tax",
        "sss_contribution",
        "philhealth",
        "pag_ibig",
        "bereavement_asst",
    ),
}


def _retype(to: str) -> None:
    for table, columns in MONEY.items():
        changes = ", ".join(f'ALTER COLUMN "{c}" TYPE {to} USING "{c}"::{to}' for c in columns)
        op.execute(f'ALTER TABLE "{table}" {changes}')


def upgrade() -> None:
    _retype("numeric")


def downgrade() -> None:
    _retype("double precision")
