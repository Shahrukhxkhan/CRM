import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Pause, Play, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const formatDate = (value: Date | string | null) => value ? new Date(value).toLocaleString() : "—";

function RunHistory({ kind }: { kind: "task_monitor" | "scheduled_export" }) {
  const status = trpc.crm.automation.status.useQuery();
  const runs = status.data?.runs.filter(run => run.jobKind === kind) ?? [];
  return <div className="mt-4 space-y-2">{runs.slice(0, 6).map(run => <div key={run.id} className="rounded-md border px-3 py-2 text-xs"><div className="flex items-center justify-between gap-2"><span>{formatDate(run.createdAt)}</span><Badge variant={run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge></div>{run.errorMessage && <p className="mt-1 text-destructive">{run.errorMessage}</p>}</div>)}{!runs.length && <p className="text-sm text-muted-foreground">No scheduled runs yet.</p>}</div>;
}

export function TaskAutomationPanel() {
  const utils = trpc.useUtils();
  const status = trpc.crm.automation.status.useQuery();
  const [cron, setCron] = useState("0 */15 * * * *");
  useEffect(() => { if (status.data?.settings.taskMonitorCronExpression) setCron(status.data.settings.taskMonitorCronExpression); }, [status.data?.settings.taskMonitorCronExpression]);
  const refresh = () => utils.crm.automation.status.invalidate();
  const save = trpc.crm.automation.saveTaskMonitor.useMutation({ onSuccess: () => { refresh(); toast.success("Task monitor schedule saved."); }, onError: error => toast.error(error.message) });
  const enable = trpc.crm.automation.enableTaskMonitor.useMutation({ onSuccess: () => { refresh(); toast.success("Task reminders and escalations are active."); }, onError: error => toast.error(error.message) });
  const pause = trpc.crm.automation.pauseTaskMonitor.useMutation({ onSuccess: () => { refresh(); toast.success("Task monitor paused."); }, onError: error => toast.error(error.message) });
  const remove = trpc.crm.automation.removeTaskMonitor.useMutation({ onSuccess: () => { refresh(); toast.success("Task monitor removed."); }, onError: error => toast.error(error.message) });
  const active = status.data?.settings.taskMonitorIsActive === true;
  return <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Reliable follow-through</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Run one owner-scoped monitor for due task reminders and escalations. Activation is available only after publishing this version.</p></div><Badge variant={active ? "secondary" : "outline"}>{active ? "Active" : "Inactive"}</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]"><Input value={cron} onChange={event => setCron(event.target.value)} aria-label="Task monitor cron expression"/><Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ cronExpression: cron })}><Save className="mr-2 h-4 w-4"/>Save</Button>{active ? <Button variant="outline" disabled={pause.isPending} onClick={() => pause.mutate()}><Pause className="mr-2 h-4 w-4"/>Pause</Button> : <Button disabled={enable.isPending} onClick={() => enable.mutate()}><Play className="mr-2 h-4 w-4"/>Enable after publish</Button>}<Button variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}><Trash2 className="mr-2 h-4 w-4"/>Remove</Button></div><p className="mt-2 text-xs text-muted-foreground">Six-field UTC cron. Default: every 15 minutes. Each execution is idempotent and recorded below.</p><RunHistory kind="task_monitor"/></section>;
}

export function ExportAutomationPanel() {
  const utils = trpc.useUtils();
  const exportsQuery = trpc.crm.exports.list.useQuery();
  const refresh = () => { utils.crm.exports.list.invalidate(); utils.crm.automation.status.invalidate(); };
  const enable = trpc.crm.exports.enableConfiguration.useMutation({ onSuccess: () => { refresh(); toast.success("Export schedule enabled."); }, onError: error => toast.error(error.message) });
  const pause = trpc.crm.exports.pauseConfiguration.useMutation({ onSuccess: () => { refresh(); toast.success("Export schedule paused."); }, onError: error => toast.error(error.message) });
  const remove = trpc.crm.exports.removeConfigurationSchedule.useMutation({ onSuccess: () => { refresh(); toast.success("Export schedule removed."); }, onError: error => toast.error(error.message) });
  return <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm"><h2 className="font-semibold">Scheduled export controls</h2><p className="mt-1 text-sm text-muted-foreground">Activate a saved configuration only from a published version. Every generated file and job outcome remains in export history.</p><div className="mt-4 space-y-3">{exportsQuery.data?.configurations.map(config => <div key={config.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{config.name}</p><p className="text-xs text-muted-foreground">{config.cronExpression} · last run {formatDate(config.lastRunAt)}</p></div><div className="flex gap-2">{config.isActive ? <Button size="sm" variant="outline" disabled={pause.isPending} onClick={() => pause.mutate({ id: config.id })}><Pause className="mr-1 h-3.5 w-3.5"/>Pause</Button> : <Button size="sm" disabled={enable.isPending} onClick={() => enable.mutate({ id: config.id })}><Play className="mr-1 h-3.5 w-3.5"/>Enable</Button>}<Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate({ id: config.id })}><Trash2 className="h-3.5 w-3.5"/></Button></div></div></div>)}{!exportsQuery.data?.configurations.length && <p className="text-sm text-muted-foreground">Create an export configuration above before enabling a schedule.</p>}</div><div className="mt-5 border-t pt-4"><div className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary"/><h3 className="text-sm font-semibold">Recent export jobs</h3></div><RunHistory kind="scheduled_export"/></div></section>;
}
