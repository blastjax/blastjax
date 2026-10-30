from __future__ import annotations

import datetime as dt
import uuid
from typing import Annotated, Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    Double,
    ForeignKey,
    Index,
    LargeBinary,
    MetaData,
    Numeric,
    PrimaryKeyConstraint,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, insert
from sqlalchemy.orm import DeclarativeBase, Mapped, column_property, mapped_column, relationship

# uuid7 is time-ordered, so ORDER BY id still means oldest first.
UuidPK = Annotated[uuid.UUID, mapped_column(primary_key=True, default=uuid.uuid7)]
Stamp = Annotated[dt.datetime | None, mapped_column(server_default=func.current_timestamp())]
StampNN = Annotated[dt.datetime, mapped_column(server_default=func.current_timestamp())]
Flag = Annotated[bool, mapped_column(server_default=text("true"))]
FormText = Annotated[str, mapped_column(server_default="")]
TripId = Annotated[uuid.UUID, mapped_column(ForeignKey("travel_trip.id", ondelete="CASCADE"))]

_SIX_ASCENDING = "n1 >= 1 AND n1 < n2 AND n2 < n3 AND n3 < n4 AND n4 < n5 AND n5 < n6 AND n6 <= 58"


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"fk": "fk_%(table_name)s_%(column_0_name)s"})
    type_annotation_map = {
        str: Text,
        float: Double,
        bytes: LargeBinary,
        dt.date: Date,
        dt.time: Time,
        dt.datetime: TIMESTAMP(timezone=True, precision=0),
    }


class AppMeta(Base):
    __tablename__ = "_app_meta"

    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[str | None]


class AppUser(Base):
    __tablename__ = "app_user"
    __table_args__ = (CheckConstraint("length(trim(username)) > 0"),)

    id: Mapped[UuidPK]
    username: Mapped[str]
    password_hash: Mapped[str]
    is_superuser: Mapped[bool] = mapped_column(server_default=text("false"))
    allowed_pages: Mapped[str | None]
    created_at: Mapped[StampNN]


class AppUserPasskey(Base):
    __tablename__ = "app_user_passkey"

    id: Mapped[UuidPK]
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    credential_id: Mapped[bytes] = mapped_column(unique=True)
    public_key: Mapped[bytes]
    sign_count: Mapped[int]
    name: Mapped[str]
    created_at: Mapped[StampNN]
    last_used_at: Mapped[dt.datetime | None]


class AppUserSession(Base):
    __tablename__ = "app_user_session"

    token_hash: Mapped[bytes] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    created_at: Mapped[StampNN]


class BillCategory(Base):
    __tablename__ = "bill_category"
    __table_args__ = (CheckConstraint("length(trim(name)) > 0"),)

    id: Mapped[UuidPK]
    name: Mapped[str]
    is_credit_card: Mapped[bool] = mapped_column(server_default=text("false"))
    defaults: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'"))
    created_at: Mapped[StampNN]


class Bill(Base):
    __tablename__ = "bill"
    __table_args__ = (CheckConstraint("period_end >= period_start"),)

    id: Mapped[UuidPK]
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bill_category.id", ondelete="CASCADE"))
    bill_date: Mapped[dt.date]
    due_date: Mapped[dt.date]
    period_start: Mapped[dt.date]
    period_end: Mapped[dt.date]
    amount: Mapped[float | None]
    minimum_due: Mapped[float | None]
    pdf_data: Mapped[bytes | None] = mapped_column(deferred=True)
    created_at: Mapped[StampNN]

    has_pdf: Mapped[bool] = column_property(pdf_data.is_not(None), expire_on_flush=False)


class BloodPressure(Base):
    __tablename__ = "blood_pressure"

    id: Mapped[UuidPK]
    systolic: Mapped[int | None]
    diastolic: Mapped[int | None]
    pulse: Mapped[int | None]
    spo2: Mapped[int | None]
    temperature: Mapped[float | None] = mapped_column(Numeric(5, 2, asdecimal=False))
    weight: Mapped[float | None] = mapped_column(Numeric(6, 2, asdecimal=False))
    notes: Mapped[str | None]
    created_at: Mapped[Stamp]


class CalendarDayOverride(Base):
    __tablename__ = "calendar_day_override"

    id: Mapped[UuidPK]
    day: Mapped[dt.date | None] = mapped_column(unique=True)
    amount: Mapped[float | None]
    saved: Mapped[float | None]
    created_at: Mapped[Stamp]


class CreditCard(Base):
    __tablename__ = "credit_card"

    id: Mapped[UuidPK]
    name: Mapped[str | None]
    credit_limit: Mapped[float | None]
    last_statement_balance: Mapped[float | None] = mapped_column(server_default=text("0"))
    current_balance: Mapped[float | None] = mapped_column(server_default=text("0"))
    minimum_due: Mapped[float | None] = mapped_column(server_default=text("0"))
    interest_rate: Mapped[float | None] = mapped_column(server_default=text("3.5"))
    statement_date: Mapped[dt.date | None]
    due_date: Mapped[dt.date | None]
    # When set, the statement comes from this bill category's latest bill instead of the columns above.
    bill_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bill_category.id", ondelete="SET NULL"))
    created_at: Mapped[Stamp]


class CreditCardPayment(Base):
    __tablename__ = "credit_card_payment"

    id: Mapped[UuidPK]
    credit_card_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("credit_card.id", ondelete="CASCADE"))
    amount: Mapped[float | None]
    payment_date: Mapped[dt.date | None]
    note: Mapped[str | None]
    created_at: Mapped[Stamp]


class FixedExpense(Base):
    __tablename__ = "fixed_expense"

    id: Mapped[UuidPK]
    period_half: Mapped[int | None]
    period_year: Mapped[int | None]
    period_month: Mapped[int | None]
    amount: Mapped[float | None]
    description: Mapped[str | None]
    created_at: Mapped[Stamp]
    # The card payment this was recorded for. Removing the card keeps the expense: that money did leave the budget.
    credit_card_payment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("credit_card_payment.id", ondelete="SET NULL")
    )


class HousePayment(Base):
    __tablename__ = "house_payment"

    id: Mapped[UuidPK]
    name: Mapped[str | None]
    notes: Mapped[str | None]
    created_at: Mapped[Stamp]

    entries: Mapped[list[HousePaymentEntry]] = relationship(
        order_by=lambda: (HousePaymentEntry.paid_on.desc(), HousePaymentEntry.id.desc())
    )


class HousePaymentEntry(Base):
    __tablename__ = "house_payment_entry"

    id: Mapped[UuidPK]
    house_payment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("house_payment.id", ondelete="CASCADE"))
    paid_on: Mapped[dt.date | None]
    amount: Mapped[float | None]
    created_at: Mapped[Stamp]


class Installment(Base):
    __tablename__ = "installment"

    id: Mapped[UuidPK]
    name: Mapped[str | None]
    installment_current: Mapped[int | None]
    installment_total: Mapped[int | None]
    principal: Mapped[float | None]
    interest: Mapped[float | None]
    payment_total: Mapped[float | None]
    start_date: Mapped[dt.date | None]
    finish_date: Mapped[dt.date | None]
    remaining: Mapped[float | None]
    original_total: Mapped[float | None]
    credit_card_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("credit_card.id", ondelete="SET NULL"))
    created_at: Mapped[Stamp]

    lines: Mapped[list[InstallmentLine]] = relationship(order_by=lambda: InstallmentLine.seq)


class InstallmentLine(Base):
    __tablename__ = "installment_line"
    __table_args__ = (UniqueConstraint("installment_id", "seq"),)

    id: Mapped[UuidPK]
    installment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("installment.id", ondelete="CASCADE"))
    seq: Mapped[int | None]
    principal: Mapped[float | None] = mapped_column(server_default=text("0"))
    interest: Mapped[float | None]
    payment_total: Mapped[float | None]


class LottoGame(Base):
    __tablename__ = "lotto_game"

    id: Mapped[UuidPK]
    name: Mapped[str] = mapped_column(unique=True)


class LottoDraw(Base):
    __tablename__ = "lotto_draw"
    __table_args__ = (
        UniqueConstraint("draw_date", "game_id"),
        CheckConstraint(
            "(n1 IS NULL AND n2 IS NULL AND n3 IS NULL AND n4 IS NULL AND n5 IS NULL AND n6 IS NULL)"
            f" OR ({_SIX_ASCENDING})"
        ),
    )

    id: Mapped[UuidPK]
    draw_date: Mapped[dt.date]
    game_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lotto_game.id", ondelete="RESTRICT"))
    n1: Mapped[int | None]
    n2: Mapped[int | None]
    n3: Mapped[int | None]
    n4: Mapped[int | None]
    n5: Mapped[int | None]
    n6: Mapped[int | None]
    created_at: Mapped[StampNN]
    jackpot_prize: Mapped[float | None]
    winners: Mapped[int] = mapped_column(server_default=text("0"))

    attempts: Mapped[list[LottoAttempt]] = relationship(
        order_by=lambda: (LottoAttempt.created_at, LottoAttempt.id)
    )


class LottoAttempt(Base):
    __tablename__ = "lotto_attempt"
    __table_args__ = (CheckConstraint(_SIX_ASCENDING),)

    id: Mapped[UuidPK]
    draw_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lotto_draw.id", ondelete="CASCADE"))
    n1: Mapped[int]
    n2: Mapped[int]
    n3: Mapped[int]
    n4: Mapped[int]
    n5: Mapped[int]
    n6: Mapped[int]
    created_at: Mapped[StampNN]
    ticket: Mapped[int | None]


class MonthlyExpense(Base):
    __tablename__ = "monthly_expense"

    id: Mapped[UuidPK]
    name: Mapped[str | None]
    description: Mapped[str | None]
    amount: Mapped[float | None]
    period_half: Mapped[int | None]
    period_year: Mapped[int | None]
    period_month: Mapped[int | None]
    is_recurring: Mapped[bool | None] = mapped_column(server_default=text("false"))
    created_at: Mapped[Stamp]
    expense_date: Mapped[dt.date | None]
    # "YYYY-MM" pay-period months a recurring expense isn't deducted in.
    skipped_months: Mapped[list[str]] = mapped_column(JSONB, server_default=text("'[]'"))
    # "YYYY-MM" pay-period month -> id of the credit card it's on, instead of the budget, from then until the
    # next entry; null takes it off a card from that month.
    charged_months: Mapped[dict[str, str | None]] = mapped_column(JSONB, server_default=text("'{}'"))
    # A month's real bills from this category replace `amount` and the date as they come in.
    bill_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bill_category.id", ondelete="SET NULL"))
    # Where a month marked paid gets logged.
    house_payment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("house_payment.id", ondelete="SET NULL"))


class PayPeriodStartOverride(Base):
    __tablename__ = "pay_period_start_override"
    __table_args__ = (UniqueConstraint("period_year", "period_month", "period_half"),)

    id: Mapped[UuidPK]
    period_year: Mapped[int | None]
    period_month: Mapped[int | None]
    period_half: Mapped[int | None]
    start_date: Mapped[dt.date | None]
    created_at: Mapped[Stamp]


class Payslip(Base):
    __tablename__ = "payslip"

    id: Mapped[UuidPK]
    total: Mapped[float | None]
    commission: Mapped[float | None]
    reimbursement: Mapped[float | None]
    medical_reimbursement: Mapped[float | None]
    others: Mapped[float | None]
    mp2: Mapped[float | None]
    allowances: Mapped[float | None]
    thirteenth_month: Mapped[float | None]
    basic_salary: Mapped[float | None]
    period_year: Mapped[int | None]
    period_month: Mapped[int | None]
    period_half: Mapped[int | None]
    notes: Mapped[str | None]
    withholding_tax: Mapped[float | None]
    sss_contribution: Mapped[float | None]
    philhealth: Mapped[float | None]
    pag_ibig: Mapped[float | None]
    bereavement_asst: Mapped[float | None]
    pdf_data: Mapped[bytes | None] = mapped_column(deferred=True)
    created_at: Mapped[Stamp]
    company: Mapped[str] = mapped_column(server_default="Sophos")

    has_pdf: Mapped[bool] = column_property(pdf_data.is_not(None), expire_on_flush=False)


class Company(Base):
    __tablename__ = "company"
    __table_args__ = (CheckConstraint("length(trim(name)) > 0"),)

    id: Mapped[UuidPK]
    name: Mapped[str]
    sort_order: Mapped[int]
    show_total: Mapped[Flag]
    show_basic_salary: Mapped[Flag]
    show_commission: Mapped[Flag]
    show_reimbursement: Mapped[Flag]
    show_medical_reimbursement: Mapped[Flag]
    show_others: Mapped[Flag]
    show_allowances: Mapped[Flag]
    show_thirteenth_month: Mapped[Flag]
    show_withholding_tax: Mapped[Flag]
    show_sss_contribution: Mapped[Flag]
    show_philhealth: Mapped[Flag]
    show_pag_ibig: Mapped[Flag]
    show_mp2: Mapped[Flag]
    show_bereavement_asst: Mapped[bool] = mapped_column(server_default=text("false"))
    created_at: Mapped[StampNN]


class PayslipDefault(Base):
    __tablename__ = "payslip_default"
    __table_args__ = (CheckConstraint("half IN (1, 2)"), PrimaryKeyConstraint("company", "half"))

    half: Mapped[int]
    period_year: Mapped[FormText]
    period_month: Mapped[FormText]
    total: Mapped[FormText]
    basic_salary: Mapped[FormText]
    commission: Mapped[FormText]
    reimbursement: Mapped[FormText]
    medical_reimbursement: Mapped[FormText]
    others: Mapped[FormText]
    mp2: Mapped[FormText]
    allowances: Mapped[FormText]
    thirteenth_month: Mapped[FormText]
    notes: Mapped[FormText]
    withholding_tax: Mapped[FormText]
    sss_contribution: Mapped[FormText]
    philhealth: Mapped[FormText]
    pag_ibig: Mapped[FormText]
    bereavement_asst: Mapped[FormText]
    updated_at: Mapped[StampNN]
    company: Mapped[str] = mapped_column(server_default="Sophos")


class PayslipDefaultSettings(Base):
    __tablename__ = "payslip_default_settings"
    __table_args__ = (CheckConstraint("settings_half IN ('first', 'second')"),)

    settings_half: Mapped[str] = mapped_column(server_default="first")
    company: Mapped[str] = mapped_column(primary_key=True, server_default="Sophos")


class TravelTrip(Base):
    __tablename__ = "travel_trip"
    __table_args__ = (
        CheckConstraint("length(trim(title)) > 0"),
        CheckConstraint("end_date >= start_date"),
    )

    id: Mapped[UuidPK]
    title: Mapped[str]
    start_date: Mapped[dt.date]
    end_date: Mapped[dt.date]
    notes: Mapped[str | None]
    created_at: Mapped[StampNN]

    cities: Mapped[list[TravelCity]] = relationship(order_by=lambda: (TravelCity.sort_order, TravelCity.id))
    flights: Mapped[list[TravelFlight]] = relationship(
        order_by=lambda: (TravelFlight.flight_date.asc().nulls_last(), TravelFlight.created_at, TravelFlight.id)
    )
    transport: Mapped[list[TravelTransport]] = relationship(
        order_by=lambda: (
            TravelTransport.travel_date.asc().nulls_last(),
            TravelTransport.created_at,
            TravelTransport.id,
        )
    )
    itinerary: Mapped[list[TravelItinerary]] = relationship(
        order_by=lambda: (
            TravelItinerary.item_date,
            TravelItinerary.start_time.asc().nulls_last(),
            TravelItinerary.created_at,
            TravelItinerary.id,
        )
    )
    accommodations: Mapped[list[TravelAccommodation]] = relationship(
        order_by=lambda: (TravelAccommodation.checkin_date, TravelAccommodation.created_at, TravelAccommodation.id)
    )


class TravelCity(Base):
    __tablename__ = "travel_city"
    __table_args__ = (CheckConstraint("length(trim(name)) > 0"),)

    id: Mapped[UuidPK]
    trip_id: Mapped[TripId]
    name: Mapped[str]
    start_date: Mapped[dt.date | None]
    end_date: Mapped[dt.date | None]
    sort_order: Mapped[int] = mapped_column(server_default=text("0"))
    created_at: Mapped[StampNN]


class TravelAccommodation(Base):
    __tablename__ = "travel_accommodation"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0"),
        CheckConstraint("checkout_date >= checkin_date"),
    )

    id: Mapped[UuidPK]
    trip_id: Mapped[TripId]
    name: Mapped[str]
    checkin_date: Mapped[dt.date]
    checkout_date: Mapped[dt.date]
    checkin_time: Mapped[dt.time | None]
    checkout_time: Mapped[dt.time | None]
    booking_confirmation: Mapped[str | None]
    instructions: Mapped[str | None]
    location_name: Mapped[str | None]
    location_map_url: Mapped[str | None]
    notes: Mapped[str | None]
    room: Mapped[str | None]
    guests: Mapped[str | None]
    phone: Mapped[str | None]
    booked_via: Mapped[str | None]
    price: Mapped[str | None]
    created_at: Mapped[StampNN]


class TravelFlight(Base):
    __tablename__ = "travel_flight"
    __table_args__ = (CheckConstraint("length(trim(flight_number)) > 0"),)

    id: Mapped[UuidPK]
    trip_id: Mapped[TripId]
    flight_number: Mapped[str]
    flight_date: Mapped[dt.date | None]
    arrival_date: Mapped[dt.date | None]
    departure_time: Mapped[dt.time | None]
    arrival_time: Mapped[dt.time | None]
    from_location: Mapped[str | None]
    from_map_url: Mapped[str | None]
    from_city: Mapped[str | None]
    from_country: Mapped[str | None]
    to_location: Mapped[str | None]
    to_map_url: Mapped[str | None]
    to_city: Mapped[str | None]
    to_country: Mapped[str | None]
    notes: Mapped[str | None]
    created_at: Mapped[StampNN]
    title: Mapped[str | None]
    airline: Mapped[str | None]
    seat: Mapped[str | None]
    terminal: Mapped[str | None]
    gate: Mapped[str | None]
    baggage: Mapped[str | None]
    confirmation: Mapped[str | None]


class TravelItinerary(Base):
    __tablename__ = "travel_itinerary"
    __table_args__ = (CheckConstraint("length(trim(activity)) > 0"),)

    id: Mapped[UuidPK]
    trip_id: Mapped[TripId]
    item_date: Mapped[dt.date]
    start_time: Mapped[dt.time | None]
    end_time: Mapped[dt.time | None]
    activity: Mapped[str]
    location_name: Mapped[str | None]
    location_map_url: Mapped[str | None]
    notes: Mapped[str | None]
    created_at: Mapped[StampNN]
    item_end_date: Mapped[dt.date | None]
    booked_via: Mapped[str | None]
    price: Mapped[str | None]
    confirmation: Mapped[str | None]


class TravelTransport(Base):
    __tablename__ = "travel_transport"
    __table_args__ = (CheckConstraint("mode IN ('bus', 'train', 'ferry')"),)

    id: Mapped[UuidPK]
    trip_id: Mapped[TripId]
    mode: Mapped[str]
    number: Mapped[str | None]
    travel_date: Mapped[dt.date | None]
    arrival_date: Mapped[dt.date | None]
    departure_time: Mapped[dt.time | None]
    arrival_time: Mapped[dt.time | None]
    from_location: Mapped[str | None]
    from_map_url: Mapped[str | None]
    from_city: Mapped[str | None]
    from_country: Mapped[str | None]
    to_location: Mapped[str | None]
    to_map_url: Mapped[str | None]
    to_city: Mapped[str | None]
    to_country: Mapped[str | None]
    notes: Mapped[str | None]
    created_at: Mapped[StampNN]
    title: Mapped[str | None]
    operator: Mapped[str | None]
    seat: Mapped[str | None]
    travel_class: Mapped[str | None]
    platform: Mapped[str | None]
    confirmation: Mapped[str | None]


Index("idx_app_user_username_lower", func.lower(AppUser.username), unique=True)
Index("idx_app_user_passkey_user", AppUserPasskey.user_id)
Index("idx_app_user_session_user", AppUserSession.user_id)
Index("idx_bill_category_name_lower", func.lower(BillCategory.name), unique=True)
Index("idx_bill_parent", Bill.category_id, Bill.due_date.desc())
Index("idx_blood_pressure_created", BloodPressure.created_at.desc())
Index("idx_company_name_lower", func.lower(Company.name), unique=True)
Index("idx_company_sort_order", Company.sort_order, unique=True)
Index(
    "idx_credit_card_payment_parent",
    CreditCardPayment.credit_card_id,
    CreditCardPayment.payment_date.desc(),
)
Index(
    "idx_fixed_expense_period",
    FixedExpense.period_year,
    FixedExpense.period_month,
    FixedExpense.period_half,
    FixedExpense.created_at.desc(),
)
Index("idx_house_payment_created", HousePayment.created_at.desc())
Index("idx_house_payment_name", HousePayment.name)
Index(
    "idx_house_payment_entry_parent",
    HousePaymentEntry.house_payment_id,
    HousePaymentEntry.paid_on.desc(),
)
Index("idx_installment_created", Installment.created_at.desc())
Index("idx_installment_credit_card_id", Installment.credit_card_id)
Index("idx_installment_finish_name", Installment.finish_date, Installment.name)
Index("idx_installment_line_parent", InstallmentLine.installment_id)
Index("idx_lotto_attempt_parent", LottoAttempt.draw_id, LottoAttempt.created_at)
Index("idx_lotto_draw_game_date", LottoDraw.game_id, LottoDraw.draw_date.desc())
Index(
    "idx_monthly_expense_period",
    MonthlyExpense.period_year,
    MonthlyExpense.period_month,
    MonthlyExpense.period_half,
    MonthlyExpense.created_at.desc(),
)
Index("idx_payslip_created", Payslip.created_at.desc())
Index(
    "idx_payslip_period_sort",
    Payslip.period_year.desc(),
    Payslip.period_month.desc(),
    Payslip.period_half.desc(),
    Payslip.created_at.desc(),
)
Index(
    "idx_travel_accommodation_parent",
    TravelAccommodation.trip_id,
    TravelAccommodation.checkin_date,
    TravelAccommodation.created_at,
)
Index("idx_travel_city_parent", TravelCity.trip_id, TravelCity.sort_order, TravelCity.id)
Index("idx_travel_flight_parent", TravelFlight.trip_id, TravelFlight.flight_date, TravelFlight.created_at)
Index(
    "idx_travel_itinerary_parent",
    TravelItinerary.trip_id,
    TravelItinerary.item_date,
    TravelItinerary.start_time,
    TravelItinerary.created_at,
)
Index(
    "idx_travel_transport_parent",
    TravelTransport.trip_id,
    TravelTransport.travel_date,
    TravelTransport.created_at,
)
Index("idx_travel_trip_period", TravelTrip.start_date.desc(), TravelTrip.id.desc())


SEED_LOTTO_GAMES = [
    "Grand Lotto 6/55",
    "Megalotto 6/45",
    "Ultra Lotto 6/58",
    "Superlotto 6/49",
    "Lotto 6/42",
]


def sync_lotto_games(conn: Any) -> None:
    conn.execute(insert(LottoGame).values([{"name": name} for name in SEED_LOTTO_GAMES]).on_conflict_do_nothing())


def create_all(conn: Any) -> None:
    Base.metadata.create_all(conn)
    sync_lotto_games(conn)
