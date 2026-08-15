import type { PipelineStage } from "./constants";

export function newestActivitiesFirst<T extends { id: number; occurredAt: Date }>(activities: T[]): T[] {
  return [...activities].sort((left, right) => {
    const timeDifference = right.occurredAt.getTime() - left.occurredAt.getTime();
    return timeDifference || right.id - left.id;
  });
}

export function completionTimestamp(completed: boolean, now = new Date()): Date | null {
  return completed ? now : null;
}

export function buildDashboardSummary<TActivity, TFollowUp>(input: {
  openLeadCount: number;
  pipelineValue: string;
  overdueFollowUpCount: number;
  pendingQuoteCount: number;
  stageSummary: { stage: PipelineStage; count: number; value: string }[];
  recentActivities: TActivity[];
  actionQueue: TFollowUp[];
}) {
  return {
    metrics: {
      openLeadCount: input.openLeadCount,
      pipelineValue: input.pipelineValue,
      overdueFollowUpCount: input.overdueFollowUpCount,
      pendingQuoteCount: input.pendingQuoteCount,
    },
    stageSummary: input.stageSummary,
    recentActivities: input.recentActivities,
    actionQueue: input.actionQueue,
  };
}
