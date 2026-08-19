import type { Express, Request, Response } from "express";
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import {
  contacts,
  followUps,
  generatedExports,
  ownerAutomationSettings,
  scheduledExports,
  scheduledJobRuns,
} from "../drizzle/schema";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";

type RunResult = {
  ok: boolean;
  skipped?: string;
  reminders?: number;
  escalations?: number;
  exportId?: number;
};

function escapeCsv(value: unknown) {
  const normalized = String(value ?? "");
  return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

export function makeRunKey(kind: "task_monitor" | "scheduled_export", taskUid: string, cronExpression: string, now: Date) {
  const fields = cronExpression.trim().split(/\s+/);
  if (!isSupportedCronExpression(cronExpression)) throw new Error("Supported schedules are every 5/10/15/30 minutes, hourly, or a fixed daily/weekly UTC hour.");
  const [, minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const everyMinutes = minute.match(/^\*\/(5|10|15|30)$/);
  if (everyMinutes && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const intervalMinutes = Number(everyMinutes[1]);
    return `${kind}:${taskUid}:interval:${intervalMinutes}:${Math.floor(now.getTime() / (intervalMinutes * 60_000))}`;
  }
  if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `${kind}:${taskUid}:hour:${now.toISOString().slice(0, 13)}`;
  }
  if (minute === "0" && /^\d{1,2}$/.test(hour) && dayOfMonth === "*" && month === "*") {
    return `${kind}:${taskUid}:calendar:${now.toISOString().slice(0, 10)}:${hour}:${dayOfWeek}`;
  }
  throw new Error("Unsupported cron expression.");
}

export function isSupportedCronExpression(value: string) {
  return /^0\s+\*\/(5|10|15|30)\s+\*\s+\*\s+\*\s+\*$/.test(value)
    || /^0\s+0\s+\*\s+\*\s+\*\s+\*$/.test(value)
    || /^0\s+0\s+(\d|1\d|2[0-3])\s+\*\s+\*\s+(\*|[0-7]|[1-7]-[1-7])$/.test(value);
}

export function isCronOnlyCaller(user: { isCron?: boolean; taskUid?: string }) {
  return user.isCron === true && Boolean(user.taskUid);
}

export function shouldRetryRunStatus(status: "running" | "succeeded" | "failed" | "skipped") {
  return status === "failed";
}

async function startRun(input: {
  ownerId: number;
  scheduledExportId?: number | null;
  jobKind: "task_monitor" | "scheduled_export";
  taskUid: string;
  runKey: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");

  const existing = await db
    .select()
    .from(scheduledJobRuns)
    .where(and(eq(scheduledJobRuns.ownerId, input.ownerId), eq(scheduledJobRuns.runKey, input.runKey)))
    .limit(1);
  if (existing[0]) {
    if (shouldRetryRunStatus(existing[0].status)) {
      await db
        .update(scheduledJobRuns)
        .set({ status: "running", errorMessage: null, resultJson: null, startedAt: new Date(), finishedAt: null })
        .where(eq(scheduledJobRuns.id, existing[0].id));
      return { duplicate: false as const, id: existing[0].id };
    }
    return { duplicate: true as const };
  }

  try {
    const [created] = await db
      .insert(scheduledJobRuns)
      .values({
        ownerId: input.ownerId,
        scheduledExportId: input.scheduledExportId ?? null,
        jobKind: input.jobKind,
        scheduleCronTaskUid: input.taskUid,
        runKey: input.runKey,
        status: "running",
      })
      .$returningId();
    return { duplicate: false as const, id: created.id };
  } catch (error) {
    const duplicate = await db
      .select()
      .from(scheduledJobRuns)
      .where(and(eq(scheduledJobRuns.ownerId, input.ownerId), eq(scheduledJobRuns.runKey, input.runKey)))
      .limit(1);
    if (duplicate[0]) return { duplicate: true as const };
    throw error;
  }
}

async function finishRun(id: number, status: "succeeded" | "failed" | "skipped", result: unknown, error?: unknown) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db
    .update(scheduledJobRuns)
    .set({
      status,
      resultJson: JSON.stringify(result),
      errorMessage: error ? String(error).slice(0, 5000) : null,
      finishedAt: new Date(),
    })
    .where(eq(scheduledJobRuns.id, id));
}

export async function runTaskMonitor(taskUid: string): Promise<RunResult> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");

  const [settings] = await db
    .select()
    .from(ownerAutomationSettings)
    .where(and(eq(ownerAutomationSettings.taskMonitorCronTaskUid, taskUid), eq(ownerAutomationSettings.taskMonitorIsActive, true)))
    .limit(1);
  if (!settings) return { ok: true, skipped: "orphan-or-paused" };

  const now = new Date();
  const run = await startRun({
    ownerId: settings.ownerId,
    jobKind: "task_monitor",
    taskUid,
    runKey: makeRunKey("task_monitor", taskUid, settings.taskMonitorCronExpression, now),
  });
  if (run.duplicate) return { ok: true, skipped: "already-processed" };

  try {
    const dueTasks = await db
      .select()
      .from(followUps)
      .where(and(eq(followUps.ownerId, settings.ownerId), isNull(followUps.completedAt), isNull(followUps.archivedAt)));

    let reminders = 0;
    let escalations = 0;
    let deliveryFailure = false;

    for (const task of dueTasks) {
      if (task.reminderAt && task.reminderAt <= now && !task.reminderNotifiedAt) {
        const delivered = await notifyOwner({
          title: `Task reminder: ${task.title}`,
          content: `This ${task.priority} priority task is due ${task.dueAt ? task.dueAt.toLocaleString() : "without a due date"}.`,
        });
        if (delivered) {
          await db.update(followUps).set({ reminderNotifiedAt: now }).where(eq(followUps.id, task.id));
          reminders += 1;
        } else {
          deliveryFailure = true;
        }
      }

      if (task.escalationAt && task.escalationAt <= now && !task.escalationNotifiedAt) {
        const delivered = await notifyOwner({
          title: `Escalation: ${task.title}`,
          content: `This ${task.priority} priority task requires attention. It was escalated at ${task.escalationAt.toLocaleString()}.`,
        });
        if (delivered) {
          await db.update(followUps).set({ escalationNotifiedAt: now }).where(eq(followUps.id, task.id));
          escalations += 1;
        } else {
          deliveryFailure = true;
        }
      }
    }

    const result = { ok: !deliveryFailure, reminders, escalations };
    if (deliveryFailure) {
      await finishRun(run.id, "failed", result, "One or more notifications could not be delivered.");
      throw new Error("One or more notifications could not be delivered.");
    }
    await finishRun(run.id, "succeeded", result);
    return result;
  } catch (error) {
    await finishRun(run.id, "failed", { ok: false }, error);
    throw error;
  }
}

export async function runScheduledExport(taskUid: string): Promise<RunResult> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");

  const [configuration] = await db
    .select()
    .from(scheduledExports)
    .where(and(eq(scheduledExports.scheduleCronTaskUid, taskUid), eq(scheduledExports.isActive, true)))
    .limit(1);
  if (!configuration) return { ok: true, skipped: "orphan-or-paused" };

  const now = new Date();
  if (!isSupportedCronExpression(configuration.cronExpression)) {
    const invalidRun = await startRun({
      ownerId: configuration.ownerId,
      scheduledExportId: configuration.id,
      jobKind: "scheduled_export",
      taskUid,
      runKey: `invalid-cron:${taskUid}`,
    });
    if (!invalidRun.duplicate) {
      await db.update(scheduledExports).set({ isActive: false }).where(eq(scheduledExports.id, configuration.id));
      await finishRun(invalidRun.id, "skipped", { ok: true, skipped: "unsupported-cron" });
      await notifyOwner({ title: `Export schedule paused: ${configuration.name}`, content: "Its stored cron expression is not supported by reliable scheduling. Update the configuration before enabling it again." });
    }
    return { ok: true, skipped: "unsupported-cron" };
  }
  const run = await startRun({
    ownerId: configuration.ownerId,
    scheduledExportId: configuration.id,
    jobKind: "scheduled_export",
    taskUid,
    runKey: makeRunKey("scheduled_export", taskUid, configuration.cronExpression, now),
  });
  if (run.duplicate) return { ok: true, skipped: "already-processed" };

  try {
    let includeArchived = false;
    try {
      const criteria = JSON.parse(configuration.criteriaJson) as { includeArchived?: boolean };
      includeArchived = criteria.includeArchived === true;
    } catch {
      // Configurations were validated when written. A malformed legacy value is treated safely.
      includeArchived = false;
    }

    const conditions = [eq(contacts.ownerId, configuration.ownerId), isNull(contacts.mergedIntoContactId)];
    if (!includeArchived) conditions.push(isNull(contacts.archivedAt));
    const rows = await db.select().from(contacts).where(and(...conditions)).orderBy(asc(contacts.lastName), asc(contacts.firstName));
    const csv = [
      "firstName,lastName,email,phone,jobTitle,relationshipStage",
      ...rows.map(row => [row.firstName, row.lastName, row.email, row.phone, row.jobTitle, row.relationshipStage].map(escapeCsv).join(",")),
    ].join("\n");
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const filename = `soloflow-contacts-${configuration.id}-${timestamp}.csv`;
    const stored = await storagePut(`crm/${configuration.ownerId}/exports/${filename}`, csv, "text/csv");
    const [created] = await db
      .insert(generatedExports)
      .values({ ownerId: configuration.ownerId, scheduledExportId: configuration.id, storageKey: stored.key, filename })
      .$returningId();
    await db.update(scheduledExports).set({ lastRunAt: now }).where(eq(scheduledExports.id, configuration.id));

    const result = { ok: true, exportId: created.id, filename, rowCount: rows.length };
    await finishRun(run.id, "succeeded", result);
    return { ok: true, exportId: created.id };
  } catch (error) {
    await finishRun(run.id, "failed", { ok: false }, error);
    throw error;
  }
}

function sendCronError(res: Response, req: Request, taskUid: string | undefined, error: unknown) {
  const detail = error instanceof Error ? error : new Error(String(error));
  console.error("[Scheduled work] Failed", detail);
  return res.status(500).json({
    error: detail.message,
    stack: detail.stack,
    context: { url: req.originalUrl, taskUid },
    timestamp: new Date().toISOString(),
  });
}

export function registerScheduledWorkRoutes(app: Express) {
  app.post("/api/scheduled/task-monitor", async (req, res) => {
    let taskUid: string | undefined;
    try {
      const user = await sdk.authenticateRequest(req);
      taskUid = user.taskUid;
      if (!isCronOnlyCaller(user) || !taskUid) return res.status(403).json({ error: "cron-only" });
      return res.json(await runTaskMonitor(taskUid));
    } catch (error) {
      return sendCronError(res, req, taskUid, error);
    }
  });

  app.post("/api/scheduled/export", async (req, res) => {
    let taskUid: string | undefined;
    try {
      const user = await sdk.authenticateRequest(req);
      taskUid = user.taskUid;
      if (!isCronOnlyCaller(user) || !taskUid) return res.status(403).json({ error: "cron-only" });
      return res.json(await runScheduledExport(taskUid));
    } catch (error) {
      return sendCronError(res, req, taskUid, error);
    }
  });
}
