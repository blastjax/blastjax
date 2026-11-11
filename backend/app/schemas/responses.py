"""What the API sends back, as routers declare it in response_model=.

FastAPI checks each response against these, and /openapi.json describes them, which is where the web's
TypeScript types come from (web/src/lib/api-schema.d.ts). Rows are derived from the models in schema.py, so a
new column reaches both without being written down again; only the extra fields a route adds are listed here.
"""

from __future__ import annotations

import datetime as dt
import functools
import operator
import types
import uuid
from typing import Annotated, Any, Literal, Union, get_args, get_origin

from pydantic import BaseModel, ConfigDict, create_model

import schema
from app.schemas.bill import BillDefaults
from app.schemas.payslip_default import PayslipDefaultForm

_ISO = (dt.date, dt.time, dt.datetime)  # db._normalize sends these as ISO strings


def _wire(t: Any) -> Any:
    if get_origin(t) is Annotated:
        return _wire(get_args(t)[0])
    if get_origin(t) in (Union, types.UnionType):
        return functools.reduce(operator.or_, map(_wire, get_args(t)))
    return str if t in _ISO else t


def _row(name: str, model: type[schema.Base], *omit: str, **extra: Any) -> type[BaseModel]:
    """A model of what db._row(model_instance, *omit, **extra) returns. An extra named like a column retypes it."""
    columns = {
        c.key: _wire(get_args(eval(model.__annotations__[c.key], vars(schema)))[0])
        for c in model.__table__.columns
        if c.key not in omit
    }
    return create_model(name, **{key: (t, ...) for key, t in (columns | extra).items()})


class Ok(BaseModel):
    ok: bool


class PdfState(BaseModel):
    ok: bool
    has_pdf: bool


# Payslips
PayslipRow = _row("PayslipRow", schema.Payslip, "pdf_data", has_pdf=bool)
PayslipPdfFields = _row("PayslipPdfFields", schema.Payslip, "id", "company", "pdf_data", "created_at")


class PayslipList(BaseModel):
    payslips: list[PayslipRow]


class PayslipImport(BaseModel):
    filename: str
    inserted: int
    ids: list[uuid.UUID]


class PayslipDefaultFormOut(PayslipDefaultForm):
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)
    period_half: str


class PayslipDefaultsBundle(BaseModel):
    formFirst: PayslipDefaultFormOut
    formSecond: PayslipDefaultFormOut
    settingsHalf: Literal["first", "second"]


CompanyRow = _row("CompanyRow", schema.Company)


class CompanyOne(BaseModel):
    company: CompanyRow


class CompanyList(BaseModel):
    companies: list[CompanyRow]


# Installments
InstallmentRow = _row("InstallmentRow", schema.Installment, due_payment=float)
CardInstallmentRow = _row("CardInstallmentRow", schema.Installment, due_payment=float, due_this_month=bool)
InstallmentLineRow = _row("InstallmentLineRow", schema.InstallmentLine, "installment_id")


class InstallmentSummary(BaseModel):
    sum_original_total: float
    sum_remaining: float
    due_this_month: float


class InstallmentDetail(BaseModel):
    installment: InstallmentRow
    lines: list[InstallmentLineRow]


class InstallmentList(BaseModel):
    installments: list[InstallmentRow]
    summary: InstallmentSummary


class InstallmentSchedules(BaseModel):
    schedules: list[InstallmentDetail]


class InstallmentPaid(BaseModel):
    installment: InstallmentRow


# House payments
HousePaymentRow = _row(
    "HousePaymentRow", schema.HousePayment, entry_count=int, total_paid=float, last_paid_on=str | None
)
HousePaymentEntry = _row("HousePaymentEntry", schema.HousePaymentEntry, "house_payment_id")


class HousePaymentSummary(BaseModel):
    sum_total_paid: float
    total_entries: float
    plan_count: float


class HousePaymentDetail(BaseModel):
    house_payment: HousePaymentRow
    entries: list[HousePaymentEntry]


class HousePaymentList(BaseModel):
    house_payments: list[HousePaymentRow]
    summary: HousePaymentSummary


# Health
BloodPressureRow = _row("BloodPressureRow", schema.BloodPressure)


class Reading(BaseModel):
    reading: BloodPressureRow


class Readings(BaseModel):
    readings: list[BloodPressureRow]


# Budget
FixedExpenseRow = _row("FixedExpenseRow", schema.FixedExpense)
MonthlyExpenseRow = _row("MonthlyExpenseRow", schema.MonthlyExpense)
CalendarDayOverrideRow = _row("CalendarDayOverrideRow", schema.CalendarDayOverride)
PayPeriodStartOverrideRow = _row("PayPeriodStartOverrideRow", schema.PayPeriodStartOverride, period_half=Literal[1, 2])


class FixedExpenseOne(BaseModel):
    expense: FixedExpenseRow


class FixedExpenseList(BaseModel):
    expenses: list[FixedExpenseRow]


class MonthlyExpenseOne(BaseModel):
    expense: MonthlyExpenseRow


class MonthlyExpenseList(BaseModel):
    expenses: list[MonthlyExpenseRow]


class CalendarDayOverrides(BaseModel):
    overrides: list[CalendarDayOverrideRow]


class PayPeriodStartOverrides(BaseModel):
    overrides: list[PayPeriodStartOverrideRow]


class PayPeriodStartOverrideOne(BaseModel):
    override: PayPeriodStartOverrideRow


# Bills
BillCategoryRow = _row("BillCategoryRow", schema.BillCategory, defaults=BillDefaults)
BillRow = _row("BillRow", schema.Bill, "pdf_data", has_pdf=bool)


class BillList(BaseModel):
    categories: list[BillCategoryRow]
    bills: list[BillRow]


class BillCategoryOne(BaseModel):
    category: BillCategoryRow


class BillOne(BaseModel):
    bill: BillRow


class BillPdfFields(BaseModel):
    bill_date: str | None
    due_date: str | None
    period_start: str | None
    period_end: str | None
    amount: float | None
    minimum_due: float | None


# Credit cards
class BudgetChange(BaseModel):
    """What a pay period's budget moved by, for the calendar's days to follow."""

    period_year: int
    period_month: int
    period_half: int
    delta: float


CreditCardRow = _row("CreditCardRow", schema.CreditCard, available_limit=float)
CreditCardSummaryRow = _row(
    "CreditCardSummaryRow", schema.CreditCard, available_limit=float, monthly_dues=float, statement_paid=bool
)
CreditCardPaymentRow = _row("CreditCardPaymentRow", schema.CreditCardPayment)
CreditCardPaymentChange = _row("CreditCardPaymentChange", schema.CreditCardPayment, budget_changes=list[BudgetChange])


class CreditCardBundle(BaseModel):
    card: CreditCardSummaryRow
    installments: list[CardInstallmentRow]
    payments: list[CreditCardPaymentRow]


class CreditCardList(BaseModel):
    cards: list[CreditCardBundle]


class CreditCardOne(BaseModel):
    card: CreditCardRow


class CreditCardPaymentSaved(BaseModel):
    payment: CreditCardPaymentChange
    card: CreditCardRow


class CreditCardPaymentRemoved(BaseModel):
    ok: bool
    budget_changes: list[BudgetChange]


# Lotto
class LottoLatestResult(BaseModel):
    draw_date: str
    numbers: list[int]
    winners: int
    best_hits: list[int] | None


class LottoGame(BaseModel):
    id: uuid.UUID
    name: str
    jackpot_prize: float | None
    last_attempt_draw_date: str | None
    latest_result: LottoLatestResult | None


class LottoGames(BaseModel):
    games: list[LottoGame]


class LottoDrawResult(LottoLatestResult):
    numbers: list[int | None]  # six nulls for a draw whose result isn't in yet
    game_id: uuid.UUID
    jackpot_prize: float | None
    attempts: list[list[int]]


class LottoCalendar(BaseModel):
    draws: list[LottoDrawResult]


class LottoDrawRow(BaseModel):
    id: uuid.UUID
    draw_date: str
    numbers: list[int]
    jackpot_prize: float | None
    winners: int
    created_at: str


class LottoAttemptRow(BaseModel):
    id: uuid.UUID
    draw_id: uuid.UUID
    ticket: int | None
    numbers: list[int]
    created_at: str


class LottoDrawDetail(BaseModel):
    draw: LottoDrawRow
    attempts: list[LottoAttemptRow]


class LottoDraws(BaseModel):
    draws: list[LottoDrawDetail]


class LottoImport(BaseModel):
    inserted: int
    updated: int
    total: int
    errors: list[str]


class LottoSync(BaseModel):
    inserted: int


# Travels
TravelTripRow = _row("TravelTripRow", schema.TravelTrip)
TravelCityRow = _row("TravelCityRow", schema.TravelCity)
TravelFlightRow = _row("TravelFlightRow", schema.TravelFlight)
TravelTransportRow = _row("TravelTransportRow", schema.TravelTransport, mode=Literal["bus", "train", "ferry"])
TravelItineraryRow = _row("TravelItineraryRow", schema.TravelItinerary)
TravelAccommodationRow = _row("TravelAccommodationRow", schema.TravelAccommodation, nights=int, days=int)


class TravelTripDetail(BaseModel):
    trip: TravelTripRow
    cities: list[TravelCityRow]
    flights: list[TravelFlightRow]
    transport: list[TravelTransportRow]
    itinerary: list[TravelItineraryRow]
    accommodations: list[TravelAccommodationRow]


class TravelTrips(BaseModel):
    trips: list[TravelTripDetail]


class MapPlace(BaseModel):
    name: str | None
    city: str | None
    country: str | None


# Search and login
class SearchResult(BaseModel):
    label: str
    section: str
    href: str


class SearchResults(BaseModel):
    results: list[SearchResult]


class AuthConfig(BaseModel):
    login_required: bool


class SessionToken(BaseModel):
    token: str


class AuthUser(BaseModel):
    username: str
    is_superuser: bool
    allowed_pages: list[str] | None


class AuthStatus(BaseModel):
    authenticated: bool
    login_required: bool
    user: AuthUser | None


class PasskeyRow(BaseModel):
    id: uuid.UUID
    name: str
    created_at: str
    last_used_at: str | None


class PasskeyOne(BaseModel):
    passkey: PasskeyRow


class PasskeyList(BaseModel):
    passkeys: list[PasskeyRow]
