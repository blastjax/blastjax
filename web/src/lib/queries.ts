import { queryOptions } from "@tanstack/react-query";
import {
  getAppUsers,
  getBills,
  getBloodPressures,
  getCalendarDayOverrides,
  getCompanies,
  getCreditCards,
  getFixedExpenses,
  getHousePayment,
  getHousePayments,
  getInstallment,
  getInstallments,
  getInstallmentSchedules,
  getLottoCalendar,
  getLottoDraws,
  getLottoGames,
  getMonthlyExpenses,
  getPasskeys,
  getPayPeriodStartOverrides,
  getPayslips,
  getTravelTrips,
} from "@/lib/api";

// Every read the pages share, one cache entry each: two pages asking for the bills get one request.
// Nothing here needs invalidating by hand; a successful write refetches what's on screen (apiFetch).
export const queries = {
  appUsers: () => queryOptions({ queryKey: ["app-users"], queryFn: getAppUsers }),
  bills: () => queryOptions({ queryKey: ["bills"], queryFn: getBills }),
  bloodPressures: (limit: number) =>
    queryOptions({ queryKey: ["blood-pressures", limit], queryFn: () => getBloodPressures(limit) }),
  calendarDays: () => queryOptions({ queryKey: ["calendar-days"], queryFn: getCalendarDayOverrides }),
  companies: () => queryOptions({ queryKey: ["companies"], queryFn: getCompanies }),
  creditCards: () => queryOptions({ queryKey: ["credit-cards"], queryFn: getCreditCards }),
  fixedExpenses: (year: number, month: number) =>
    queryOptions({ queryKey: ["fixed-expenses", year, month], queryFn: () => getFixedExpenses(undefined, year, month) }),
  housePayment: (id: string) => queryOptions({ queryKey: ["house-payments", id], queryFn: () => getHousePayment(id) }),
  housePayments: () => queryOptions({ queryKey: ["house-payments"], queryFn: () => getHousePayments(500) }),
  installment: (id: string) => queryOptions({ queryKey: ["installments", id], queryFn: () => getInstallment(id) }),
  installments: () => queryOptions({ queryKey: ["installments"], queryFn: () => getInstallments(500) }),
  installmentSchedules: () =>
    queryOptions({ queryKey: ["installment-schedules"], queryFn: () => getInstallmentSchedules(2000) }),
  lottoCalendar: (year: number, month: number) =>
    queryOptions({ queryKey: ["lotto-calendar", year, month], queryFn: () => getLottoCalendar(year, month) }),
  lottoDraws: (gameId: string) =>
    queryOptions({ queryKey: ["lotto-draws", gameId], queryFn: () => getLottoDraws(gameId, 2000) }),
  lottoGames: () => queryOptions({ queryKey: ["lotto-games"], queryFn: getLottoGames }),
  /** All months, or one month's (recurring ones included). */
  monthlyExpenses: (year?: number, month?: number) =>
    queryOptions({
      queryKey: ["monthly-expenses", year ?? null, month ?? null],
      queryFn: () => getMonthlyExpenses(undefined, year, month),
    }),
  passkeys: () => queryOptions({ queryKey: ["passkeys"], queryFn: getPasskeys }),
  payPeriodStarts: () => queryOptions({ queryKey: ["pay-period-starts"], queryFn: getPayPeriodStartOverrides }),
  payslips: (limit: number, company?: string) =>
    queryOptions({ queryKey: ["payslips", limit, company ?? null], queryFn: () => getPayslips(limit, company) }),
  travelTrips: () => queryOptions({ queryKey: ["travel-trips"], queryFn: () => getTravelTrips(500) }),
};
