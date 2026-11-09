# Node be:core:schema: schema.py
Kind: module
Language: python, 562 lines of code, location: backend/schema.py

Source excerpt: backend/schema.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import datetime as dt
   4  import uuid
   5  from typing import Annotated, Any
   6  
   7  from sqlalchemy import (
   8      CheckConstraint,
   9      Date,
  10      Double,
  11      ForeignKey,
  12      Index,
  13      LargeBinary,
  14      MetaData,
  15      Numeric,
  16      PrimaryKeyConstraint,
  17      Text,
  18      Time,
  19      UniqueConstraint,
  20      func,
  21      inspect,
  22      text,
  23  )
  24  from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, insert
  25  from sqlalchemy.orm import DeclarativeBase, Mapped, column_property, mapped_column, relationship
  26  from sqlalchemy.schema import AddConstraint, CreateColumn
  27  
  28  # uuid7 is time-ordered, so ORDER BY id still means oldest first.
  29  UuidPK = Annotated[uuid.UUID, mapped_column(primary_key=True, default=uuid.uuid7)]
  30  Stamp = Annotated[dt.datetime | None, mapped_column(server_default=func.current_timestamp())]
  31  StampNN = Annotated[dt.datetime, mapped_column(server_default=func.current_timestamp())]
  32  Flag = Annotated[bool, mapped_column(server_default=text("true"))]
  33  FormText = Annotated[str, mapped_column(server_default="")]
  34  TripId = Annotated[uuid.UUID, mapped_column(ForeignKey("travel_trip.id", ondelete="CASCADE"))]
  35  
  36  _SIX_ASCENDING = "n1 >= 1 AND n1 < n2 AND n2 < n3 AND n3 < n4 AND n4 < n5 AND n5 < n6 AND n6 <= 58"
  37  
  38  
  39  class Base(DeclarativeBase):
  40      metadata = MetaData(naming_convention={"fk": "fk_%(table_name)s_%(column_0_name)s"})
  41      type_annotation_map = {
  42          str: Text,
  43          float: Double,
  44          bytes: LargeBinary,
  45          dt.date: Date,
  46          dt.time: Time,
  47          dt.datetime: TIMESTAMP(timezone=True, precision=0),
  48      }
  49  
  50  
  51  class AppMeta(Base):
  52      __tablename__ = "_app_meta"
  53  
  54      key: Mapped[str] = mapped_column(primary_key=True)
  55      value: Mapped[str | None]
  56  
  57  
  58  class AppUser(Base):
  59      __tablename__ = "app_user"
  60      __table_args__ = (CheckConstraint("length(trim(username)) > 0"),)
  61  
  62      id: Mapped[UuidPK]
  63      username: Mapped[str]
  64      password_hash: Mapped[str]
  65      is_superuser: Mapped[bool] = mapped_column(server_default=text("false"))
  66      allowed_pages: Mapped[str | None]
  67      created_at: Mapped[StampNN]
  68  
  69  
  70  class AppUserPasskey(Base):
  71      __tablename__ = "app_user_passkey"
  72  
  73      id: Mapped[UuidPK]
  74      user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
  75      credential_id: Mapped[bytes] = mapped_column(unique=True)
  76      public_key: Mapped[bytes]
  77      sign_count: Mapped[int]
  78      name: Mapped[str]
  79      created_at: Mapped[StampNN]
  80      last_used_at: Mapped[dt.datetime | None]
  81  
  82  
  83  class AppUserSession(Base):
  84      __tablename__ = "app_user_session"
  85  
  86      token_hash: Mapped[bytes] = mapped_column(primary_key=True)
  87      user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
  88      created_at: Mapped[StampNN]
  89  
  90  
  91  class BillCategory(Base):
  92      __tablename__ = "bill_category"
  93      __table_args__ = (CheckConstraint("length(trim(name)) > 0"),)
  94  
  95      id: Mapped[UuidPK]
  96      name: Mapped[str]
  97      is_credit_card: Mapped[bool] = mapped_column(server_default=text("false"))
  98      defaults: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'"))
  99      created_at: Mapped[StampNN]
 100  
 101  
 102  class Bill(Base):
 103      __tablename__ = "bill"
 104      __table_args__ = (CheckConstraint("period_end >= period_start"),)
 105  
 106      id: Mapped[UuidPK]
 107      category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bill_category.id", ondelete="CASCADE"))
 108      bill_date: Mapped[dt.date]
 109      due_date: Mapped[dt.date]
 110      period_start: Mapped[dt.date]
 111      period_end: Mapped[dt.date]
 112      amount: Mapped[float | None]
 113      minimum_due: Mapped[float | None]
 114      pdf_data: Mapped[bytes | None] = mapped_column(deferred=True)
 115      created_at: Mapped[StampNN]
 116  
 117      has_pdf: Mapped[bool] = column_property(pdf_data.is_not(None), expire_on_flush=False)
 118  
 119  
 120  class BloodPressure(Base):
 121      __tablename__ = "blood_pressure"
 122  
 123      id: Mapped[UuidPK]
 124      systolic: Mapped[int | None]
 125      diastolic: Mapped[int | None]
 126      pulse: Mapped[int | None]
 127      spo2: Mapped[int | None]
 128      temperature: Mapped[float | None] = mapped_column(Numeric(5, 2, asdecimal=False))
 129      weight: Mapped[float | None] = mapped_column(Numeric(6, 2, asdecimal=False))
 130      notes: Mapped[str | None]
 131      created_at: Mapped[Stamp]
 132  
 133  
 134  class CalendarDayOverride(Base):
 135      __tablename__ = "calendar_day_override"
 136  
 137      id: Mapped[UuidPK]
 138      day: Mapped[dt.date | None] = mapped_column(unique=True)
 139      amount: Mapped[float | None]
 140      saved: Mapped[float | None]
 141      created_at: Mapped[Stamp]
 142  
 143  
 144  class CreditCard(Base):
 145      __tablename__ = "credit_card"
 146  
 147      id: Mapped[UuidPK]
 148      name: Mapped[str | None]
 149      credit_limit: Mapped[float | None]
 150      last_statement_balance: Mapped[float | None] = mapped_column(server_default=text("0"))
```

## Outgoing connections
- none

## Incoming connections
- db.py (be:core:db) -> call
- test_core.py (be:core:test_core) -> call
- scripts/ (migrations) (be:scripts) -> call
