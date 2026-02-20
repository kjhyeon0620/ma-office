export function formatEventTime(ts?: string): string {
  if (!ts) {
    return "—";
  }

  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return `${date.toISOString().slice(11, 19)}Z`;
}
