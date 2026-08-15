export const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export const ACTIVITY_TYPES = ["call", "email", "meeting", "message", "note"] as const;
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined"] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const OPEN_PIPELINE_STAGES: PipelineStage[] = ["new", "contacted", "qualified", "proposal"];
export const PENDING_QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent"];
