import { BillFrequency } from "@prisma/client";

export type BillingPeriod = {
  billingYear: number;
  billingMonth: number;
  label: string;
};

function usesFinancialYearCycle(frequency: BillFrequency) {
  return (
    frequency === "QUARTERLY" ||
    frequency === "SEMESTER" ||
    frequency === "YEARLY"
  );
}

function formatPeriodLabel(
  billingYear: number,
  billingMonth: number,
  span: number,
) {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short" });
  const startDate = new Date(billingYear, billingMonth - 1, 1);
  const endDate = new Date(billingYear, billingMonth - 1 + span - 1, 1);
  const startLabel = formatter.format(startDate);
  const endLabel = formatter.format(endDate);
  const endYear = endDate.getFullYear();

  if (span === 1) {
    return `${startLabel} ${billingYear}`;
  }

  return billingYear === endYear
    ? `${startLabel}-${endLabel} ${billingYear}`
    : `${startLabel} ${billingYear}-${endLabel} ${endYear}`;
}

export function getFrequencyMonthSpan(frequency: BillFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return 1;
    case "BIMONTHLY":
      return 2;
    case "TRIMONTHLY":
      return 3;
    case "QUARTERLY":
      return 3;
    case "SEMESTER":
      return 6;
    case "YEARLY":
      return 12;
    default:
      return 1;
  }
}

export function getBillingPeriodsForYear(
  year: number,
  frequency: BillFrequency,
): BillingPeriod[] {
  const span = getFrequencyMonthSpan(frequency);

  if (frequency === "QUARTERLY") {
    return [
      { billingYear: year, billingMonth: 4, label: formatPeriodLabel(year, 4, span) },
      { billingYear: year, billingMonth: 7, label: formatPeriodLabel(year, 7, span) },
      { billingYear: year, billingMonth: 10, label: formatPeriodLabel(year, 10, span) },
      { billingYear: year + 1, billingMonth: 1, label: formatPeriodLabel(year + 1, 1, span) },
    ];
  }

  if (frequency === "SEMESTER") {
    return [
      { billingYear: year, billingMonth: 4, label: formatPeriodLabel(year, 4, span) },
      { billingYear: year, billingMonth: 10, label: formatPeriodLabel(year, 10, span) },
    ];
  }

  if (frequency === "YEARLY") {
    return [{ billingYear: year, billingMonth: 4, label: formatPeriodLabel(year, 4, span) }];
  }

  const periods: BillingPeriod[] = [];

  for (let startMonth = 1; startMonth <= 12; startMonth += span) {
    periods.push({
      billingYear: year,
      billingMonth: startMonth,
      label: formatPeriodLabel(year, startMonth, span),
    });
  }

  return periods;
}

export function getBillingCycleYear(
  billingYear: number,
  billingMonth: number,
  frequency: BillFrequency,
) {
  if (usesFinancialYearCycle(frequency) && billingMonth < 4) {
    return billingYear - 1;
  }

  return billingYear;
}

export function getPreviousBillingPeriod(
  billingYear: number,
  billingMonth: number,
  frequency: BillFrequency,
): BillingPeriod {
  if (usesFinancialYearCycle(frequency)) {
    const cycleYear = getBillingCycleYear(billingYear, billingMonth, frequency);
    const periods = [
      ...getBillingPeriodsForYear(cycleYear - 1, frequency),
      ...getBillingPeriodsForYear(cycleYear, frequency),
    ].sort(compareBillingPeriods);
    const currentIndex = periods.findIndex(
      (period) =>
        period.billingYear === billingYear && period.billingMonth === billingMonth,
    );

    if (currentIndex > 0) {
      return periods[currentIndex - 1];
    }
  }

  const span = getFrequencyMonthSpan(frequency);
  let previousMonth = billingMonth - span;
  let previousYear = billingYear;

  while (previousMonth <= 0) {
    previousMonth += 12;
    previousYear -= 1;
  }

  const previousPeriods = getBillingPeriodsForYear(previousYear, frequency);
  return (
    previousPeriods.find((period) => period.billingMonth === previousMonth) ?? {
      billingYear: previousYear,
      billingMonth: previousMonth,
      label: `${previousMonth}/${previousYear}`,
    }
  );
}

export function getCurrentBillingPeriod(
  today: Date,
  frequency: BillFrequency,
): BillingPeriod {
  if (usesFinancialYearCycle(frequency)) {
    const year = today.getFullYear();
    const cycleYear = today.getMonth() + 1 >= 4 ? year : year - 1;
    const periods = getBillingPeriodsForYear(cycleYear, frequency);
    const todayTime = today.getTime();
    const currentPeriod =
      [...periods]
        .reverse()
        .find(
          (period) =>
            new Date(period.billingYear, period.billingMonth - 1, 1).getTime() <= todayTime,
        ) ?? periods[0];

    return currentPeriod;
  }

  const year = today.getFullYear();
  const periods = getBillingPeriodsForYear(year, frequency);
  const month = today.getMonth() + 1;
  const currentPeriod =
    [...periods].reverse().find((period) => period.billingMonth <= month) ?? periods[0];

  return currentPeriod;
}

export function compareBillingPeriods(a: BillingPeriod, b: BillingPeriod) {
  if (a.billingYear !== b.billingYear) {
    return a.billingYear - b.billingYear;
  }

  return a.billingMonth - b.billingMonth;
}
