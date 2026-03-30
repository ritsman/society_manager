import { BillFrequency } from "@prisma/client";

export type BillingPeriod = {
  billingYear: number;
  billingMonth: number;
  label: string;
};

export function getFrequencyMonthSpan(frequency: BillFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return 1;
    case "BIMONTHLY":
      return 2;
    case "TRIMONTHLY":
      return 3;
    case "QUARTERLY":
      return 4;
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
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short" });
  const periods: BillingPeriod[] = [];

  for (let startMonth = 1; startMonth <= 12; startMonth += span) {
    const startLabel = formatter.format(new Date(year, startMonth - 1, 1));
    const endMonth = Math.min(12, startMonth + span - 1);
    const endLabel = formatter.format(new Date(year, endMonth - 1, 1));

    periods.push({
      billingYear: year,
      billingMonth: startMonth,
      label: span === 1 ? `${startLabel} ${year}` : `${startLabel}-${endLabel} ${year}`,
    });
  }

  return periods;
}

export function getPreviousBillingPeriod(
  billingYear: number,
  billingMonth: number,
  frequency: BillFrequency,
): BillingPeriod {
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
