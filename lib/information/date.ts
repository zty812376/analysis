export const INFORMATION_TIMEZONE = "Asia/Shanghai";
export const INFORMATION_REFRESH_INTERVAL_MINUTES = 10;

function formatPart(
  date: Date,
  part: "year" | "month" | "day",
  timeZone = INFORMATION_TIMEZONE
) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    [part]: "numeric",
  });

  return formatter.format(date);
}

export function formatInformationDayKey(
  date: Date,
  timeZone = INFORMATION_TIMEZONE
) {
  const year = formatPart(date, "year", timeZone);
  const month = formatPart(date, "month", timeZone).padStart(2, "0");
  const day = formatPart(date, "day", timeZone).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isInformationPublishedOnDay(
  value: Date | string,
  dayKey: string,
  timeZone = INFORMATION_TIMEZONE
) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return formatInformationDayKey(date, timeZone) === dayKey;
}

export function isInformationStale(
  latestRunAt: Date | string | null | undefined,
  currentDayKey = formatInformationDayKey(new Date()),
  now = new Date()
) {
  if (!latestRunAt) {
    return true;
  }

  const latestRunDate =
    latestRunAt instanceof Date ? latestRunAt : new Date(latestRunAt);

  if (Number.isNaN(latestRunDate.getTime())) {
    return true;
  }

  if (formatInformationDayKey(latestRunDate) !== currentDayKey) {
    return true;
  }

  const elapsedMinutes =
    (now.getTime() - latestRunDate.getTime()) / (1000 * 60);

  return elapsedMinutes >= INFORMATION_REFRESH_INTERVAL_MINUTES;
}
