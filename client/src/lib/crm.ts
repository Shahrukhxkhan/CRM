export const pipelineStages = [
  { value: "new", label: "New", color: "bg-slate-400" },
  { value: "contacted", label: "Contacted", color: "bg-sky-500" },
  { value: "qualified", label: "Qualified", color: "bg-violet-500" },
  { value: "proposal", label: "Proposal", color: "bg-amber-500" },
  { value: "won", label: "Won", color: "bg-emerald-500" },
  { value: "lost", label: "Lost", color: "bg-rose-400" },
] as const;

export type PipelineStage = (typeof pipelineStages)[number]["value"];

export const activityTypes = ["call", "email", "meeting", "message", "note"] as const;

export function stageLabel(stage: string) {
  return pipelineStages.find(item => item.value === stage)?.label ?? stage;
}

export function formatMoney(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function toDateTimeInput(value: Date | string = new Date()) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function splitTags(value: string) {
  return Array.from(new Set(value.split(",").map(tag => tag.trim()).filter(Boolean)));
}
