"""
Payslip and installment API (PostgreSQL via ``DATABASE_URL`` or ``DB_*``).

Run from the `backend` directory: ``uvicorn main:app --reload``
"""

from app.factory import create_app

app = create_app()
