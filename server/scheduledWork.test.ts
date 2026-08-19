import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  notifyOwner: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));
vi.mock("./storage", () => ({ storagePut: mocks.storagePut }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));

import { isSupportedCronExpression, runScheduledExport, runTaskMonitor } from "./scheduledWork";

function query(result: unknown) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function createDb(selectResults: unknown[]) {
  return {
    select: vi.fn(() => query(selectResults.shift() ?? [])),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ $returningId: vi.fn().mockResolvedValue([{ id: 91 }]) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  };
}

describe("scheduled work execution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records and delivers a due task reminder once", async () => {
    const db = createDb([
      [{ id: 1, ownerId: 9, taskMonitorCronExpression: "0 */15 * * * *", taskMonitorCronTaskUid: "task-cron", taskMonitorIsActive: true }],
      [],
      [{ id: 44, ownerId: 9, title: "Call Ada", priority: "high", dueAt: new Date(), reminderAt: new Date(0), reminderNotifiedAt: null, escalationAt: null, escalationNotifiedAt: null, completedAt: null, archivedAt: null }],
    ]);
    mocks.getDb.mockResolvedValue(db);
    mocks.notifyOwner.mockResolvedValue(true);

    const result = await runTaskMonitor("task-cron");

    expect(result).toMatchObject({ ok: true, reminders: 1, escalations: 0 });
    expect(mocks.notifyOwner).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("fails a monitor run when notification delivery fails so the cron can retry", async () => {
    const db = createDb([
      [{ id: 1, ownerId: 9, taskMonitorCronExpression: "0 */15 * * * *", taskMonitorCronTaskUid: "task-cron", taskMonitorIsActive: true }],
      [],
      [{ id: 44, ownerId: 9, title: "Call Ada", priority: "high", dueAt: new Date(), reminderAt: new Date(0), reminderNotifiedAt: null, escalationAt: null, escalationNotifiedAt: null, completedAt: null, archivedAt: null }],
    ]);
    mocks.getDb.mockResolvedValue(db);
    mocks.notifyOwner.mockResolvedValue(false);

    await expect(runTaskMonitor("task-cron")).rejects.toThrow("could not be delivered");
    expect(db.update).toHaveBeenCalled();
  });

  it("skips an orphan task monitor without creating an execution record", async () => {
    const db = createDb([[]]);
    mocks.getDb.mockResolvedValue(db);

    await expect(runTaskMonitor("unknown-cron")).resolves.toEqual({ ok: true, skipped: "orphan-or-paused" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips an already succeeded invocation but retries a previously failed one", async () => {
    const succeededDb = createDb([
      [{ id: 1, ownerId: 9, taskMonitorCronExpression: "0 */15 * * * *", taskMonitorCronTaskUid: "task-cron", taskMonitorIsActive: true }],
      [{ id: 81, status: "succeeded" }],
    ]);
    mocks.getDb.mockResolvedValue(succeededDb);
    await expect(runTaskMonitor("task-cron")).resolves.toEqual({ ok: true, skipped: "already-processed" });

    const failedDb = createDb([
      [{ id: 1, ownerId: 9, taskMonitorCronExpression: "0 */15 * * * *", taskMonitorCronTaskUid: "task-cron", taskMonitorIsActive: true }],
      [{ id: 82, status: "failed" }],
      [],
    ]);
    mocks.getDb.mockResolvedValue(failedDb);
    await expect(runTaskMonitor("task-cron")).resolves.toMatchObject({ ok: true, reminders: 0, escalations: 0 });
    expect(failedDb.insert).not.toHaveBeenCalled();
    expect(failedDb.update).toHaveBeenCalledTimes(2);
  });

  it("creates a generated-export record and run history for an active export schedule", async () => {
    const db = createDb([
      [{ id: 7, ownerId: 9, criteriaJson: "{}", cronExpression: "0 0 9 * * *", scheduleCronTaskUid: "export-cron", isActive: true }],
      [],
      [],
    ]);
    mocks.getDb.mockResolvedValue(db);
    mocks.storagePut.mockResolvedValue({ key: "crm/9/exports/test.csv", url: "/manus-storage/crm/9/exports/test.csv" });

    const result = await runScheduledExport("export-cron");

    expect(result).toEqual({ ok: true, exportId: 91 });
    expect(mocks.storagePut).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("recognizes only the schedule shapes with defined idempotency slots", () => {
    expect(isSupportedCronExpression("0 */5 * * * *")).toBe(true);
    expect(isSupportedCronExpression("0 0 * * * *")).toBe(true);
    expect(isSupportedCronExpression("0 0 9 * * 1-5")).toBe(true);
    expect(isSupportedCronExpression("0 0 * * * 1")).toBe(false);
  });
});
