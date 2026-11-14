export type ProfileMonthDay = {
  month: number;
  day: number;
};

export type ProfileDebutDate = ProfileMonthDay & {
  year?: number;
};

export type ProfileToday = {
  year: number;
  month: number;
  day: number;
};

export type ProfileDateCountdown = {
  text: string;
  badge?: string;
  tone?: "amber" | "violet";
};

function parseParts(
  value: string,
): (ProfileDebutDate & { year?: number }) | null {
  const normalized = value
    .trim()
    .replace(/[年月]/g, "-")
    .replace(/日/g, "")
    .replace(/[/.]/g, "-");
  const parts = normalized.split("-");

  let year: number | undefined;
  let monthText: string;
  let dayText: string;
  if (
    parts.length === 3 &&
    /^\d{4}$/.test(parts[0]) &&
    /^\d{1,2}$/.test(parts[1]) &&
    /^\d{1,2}$/.test(parts[2])
  ) {
    year = Number(parts[0]);
    [monthText, dayText] = parts.slice(1);
  } else if (
    parts.length === 2 &&
    /^\d{1,2}$/.test(parts[0]) &&
    /^\d{1,2}$/.test(parts[1])
  ) {
    [monthText, dayText] = parts;
  } else {
    return null;
  }

  const month = Number(monthText);
  const day = Number(dayText);
  if (
    (year !== undefined && year < 1) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(2000, month, 0)).getUTCDate()
  ) {
    return null;
  }
  return { ...(year === undefined ? {} : { year }), month, day };
}

export function parseMonthDay(value: string): ProfileMonthDay | null {
  const parsed = parseParts(value);
  return parsed ? { month: parsed.month, day: parsed.day } : null;
}

export function parseDebut(value: string): ProfileDebutDate | null {
  return parseParts(value);
}

function dateInYear(month: number, day: number, year: number): number {
  const isLeapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const adjusted = month === 2 && day === 29 && !isLeapYear
    ? { month: 3, day: 1 }
    : { month, day };
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, adjusted.month - 1, adjusted.day);
  return date.getTime();
}

function daysBetween(from: number, to: number): number {
  return Math.round((to - from) / 86_400_000);
}

export function getProfileDateCountdown(
  date: ProfileDebutDate,
  kind: "birthday" | "debut",
  today: ProfileToday,
): ProfileDateCountdown {
  const todayTimestamp = dateInYear(today.month, today.day, today.year);
  const thisYearTimestamp = dateInYear(date.month, date.day, today.year);
  let daysUntil = daysBetween(todayTimestamp, thisYearTimestamp);

  if (kind === "birthday" || date.year === undefined) {
    if (daysUntil < 0) {
      daysUntil = daysBetween(
        todayTimestamp,
        dateInYear(date.month, date.day, today.year + 1),
      );
    }
    if (kind === "birthday" && daysUntil === 0) {
      return { text: "", badge: "今日は誕生日！", tone: "amber" };
    }
    if (kind === "birthday" && daysUntil <= 30) {
      return { text: `あと ${daysUntil} 日`, badge: "もうすぐ", tone: "violet" };
    }
    return { text: `あと ${daysUntil} 日` };
  }

  const debutYear = date.year;
  const debutTimestamp = dateInYear(date.month, date.day, debutYear);
  const daysUntilDebut = daysBetween(todayTimestamp, debutTimestamp);
  if (daysUntilDebut > 0) {
    return { text: `デビューまであと ${daysUntilDebut} 日` };
  }

  const yearDifference = today.year - debutYear;
  if (daysUntil === 0 && yearDifference > 0) {
    return {
      text: "",
      badge: `今日で ${yearDifference}周年！`,
      tone: "amber",
    };
  }
  if (yearDifference <= 0) {
    return { text: "今年デビュー" };
  }
  if (daysUntil > 0 && daysUntil <= 30) {
    return {
      text: `もうすぐ ${yearDifference}周年（あと ${daysUntil} 日）`,
    };
  }
  return {
    text: `${daysUntil > 0 ? yearDifference - 1 : yearDifference}周年`,
  };
}
