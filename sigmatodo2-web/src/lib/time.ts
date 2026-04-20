export function formatTimeLeft(dueBy: string | null): { text: string; overdue: boolean } | null {
  if (!dueBy) return null;
  const due = new Date(dueBy).getTime();
  const now = Date.now();
  const diff = due - now;
  const abs = Math.abs(diff);
  const overdue = diff < 0;

  const mins = Math.floor(abs / 60000);
  const hours = Math.floor(abs / 3600000);
  const days = Math.floor(abs / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  let text: string;
  if (months >= 2) text = `${months} months`;
  else if (weeks >= 2) text = `${weeks} weeks`;
  else if (days >= 1) text = `${days} day${days === 1 ? '' : 's'}`;
  else if (hours >= 1) text = `${hours}h ${mins % 60}m`;
  else text = `${mins}m`;

  return { text: overdue ? `${text} ago` : `in ${text}`, overdue };
}
