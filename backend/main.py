"""
Budget workbook API: data is read from SQLite. Excel files are imported via upload/import.

Run from the `backend` directory: ``uvicorn main:app --reload``
"""

from app.factory import create_app

app = create_app()
