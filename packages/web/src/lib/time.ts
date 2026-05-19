/**
 * Spec-aligned semantic time formatting (ux-spec.md §6).
 * - Within last hour: "12m ago"
 * - Today:            "3:14pm"
 * - Yesterday:        "Yesterday, 9:02pm"
 * - This week:        "Wed, 9:02pm"
 * - Older:            "May 14, 2026"
 */
export const formatRelative = (ts: number, now: Date = new Date()): string => {
  const d = new Date(ts);
  const diffMs = now.getTime() - ts;
  const diffMin = diffMs / 60_000;

  if (diffMin < 60) {
    if (diffMin < 1) return "just now";
    return `${Math.round(diffMin)}m ago`;
  }

  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return formatClock(d);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return `Yesterday, ${formatClock(d)}`;
  }

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 7) {
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    return `${weekday}, ${formatClock(d)}`;
  }

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatClock = (d: Date): string => {
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const period = hours >= 12 ? "pm" : "am";
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${minutes}${period}`;
};
