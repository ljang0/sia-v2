const QUOTA_RETENTION_DAYS = 8;

export function dailyQuotaWindow(now: Date) {
  const period = now.toISOString().slice(0, 10);
  return {
    period,
    expiresAt: Math.floor(now.getTime() / 1_000) + QUOTA_RETENTION_DAYS * 24 * 60 * 60,
  };
}

export function nextUtcDay(period: string): string {
  const start = new Date(`${period}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString();
}
