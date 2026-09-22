"""
Payslip and installment API (cloud PostgreSQL, see ``backend/db.py``).

Run from the `backend` directory: ``uvicorn main:app --reload``
"""

from app.factory import create_app

app = create_app()
