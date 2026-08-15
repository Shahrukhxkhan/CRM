import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowRight, CalendarClock, CircleDollarSign, FileClock, Plus, RefreshCw, UsersRound } from "lucide-react";
import { useLocation } from "wouter";

const stageMeta = [
  { key: "new", label: "New", tone: "bg-slate-400" },
  { key: "contacted", label: "Contacted", tone: "bg-sky-500" },
  { key: "qualified", label: "Qualified", tone: "bg-violet-500" },
  { key: "proposal", label: "Proposal", tone: "bg-amber-500" },
] as const;

const activityLabels = { call: "Call", email: "Email", meeting: "Meeting", message: "Message", note: "Note" };

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function MetricCard({ icon: Icon, label, value, detail, tone = "bg-primary/10 text-primary" }: { icon: typeof UsersRound; label: string; value: string | number; detail: string; tone?: string }) {
  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-[0_12px_30px_-22px_rgba(15,23,42,0.35)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 font-display text-3xl font-semibold tracking-[-0.045em] text-slate-950">{value}</p>
          </div>
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
        </div>
        <p className="mt-4 text-xs text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-7">
      <div className="flex items-end justify-between"><div className="space-y-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-64" /></div><Skeleton className="h-11 w-28 rounded-xl" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-2xl" />)}</div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]"><Skeleton className="h-[26rem] rounded-2xl" /><Skeleton className="h-[26rem] rounded-2xl" /></div>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const dashboard = trpc.dashboard.get.useQuery();

  if (dashboard.isLoading) return <DashboardSkeleton />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Activity className="h-6 w-6" /></span>
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-[-0.035em] text-slate-950">Your dashboard needs a refresh</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">We could not load your workspace summary. Your records have not been changed.</p>
        <Button onClick={() => dashboard.refetch()} className="mt-6 rounded-xl"><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>
      </section>
    );
  }

  const { metrics, stageSummary, actionQueue, recentActivities } = dashboard.data;
  const byStage = new Map(stageSummary.map(item => [item.stage, item]));
  const hasWorkspaceData = metrics.openLeadCount > 0 || actionQueue.length > 0 || recentActivities.length > 0;

  return (
    <div className="mx-auto max-w-[1440px] space-y-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your workspace</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">A clear view of what matters.</h1>
          <p className="mt-2 text-sm text-slate-600">Keep the next conversation, task, and opportunity close at hand.</p>
        </div>
        <Button onClick={() => setLocation("/leads?create=1")} className="h-11 rounded-xl shadow-lg shadow-primary/20"><Plus className="mr-2 h-4 w-4" /> Add lead</Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace summary">
        <MetricCard icon={UsersRound} label="Open leads" value={metrics.openLeadCount} detail="Across active pipeline stages" />
        <MetricCard icon={CircleDollarSign} label="Pipeline value" value={formatCurrency(metrics.pipelineValue)} detail="Estimated value of open opportunities" tone="bg-violet-50 text-violet-600" />
        <MetricCard icon={CalendarClock} label="Overdue follow-ups" value={metrics.overdueFollowUpCount} detail="Tasks that need your attention" tone="bg-amber-50 text-amber-700" />
        <MetricCard icon={FileClock} label="Pending quotes" value={metrics.pendingQuoteCount} detail="Draft or sent quotes awaiting movement" tone="bg-sky-50 text-sky-600" />
      </section>

      {!hasWorkspaceData ? (
        <section className="rounded-[1.5rem] border border-dashed border-primary/30 bg-white px-6 py-12 text-center shadow-[0_12px_30px_-22px_rgba(15,23,42,0.25)] sm:px-12">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UsersRound className="h-6 w-6" /></span>
          <h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.035em] text-slate-950">Your pipeline is ready when you are.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Add your first lead to start tracking conversations, follow-ups, and quotes in one connected workspace.</p>
          <Button onClick={() => setLocation("/leads?create=1")} className="mt-6 rounded-xl"><Plus className="mr-2 h-4 w-4" /> Add your first lead</Button>
        </section>
      ) : (
        <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <Card className="rounded-2xl border-slate-200/80 bg-white shadow-[0_12px_30px_-22px_rgba(15,23,42,0.35)]">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Pipeline snapshot</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.03em] text-slate-950">Opportunity at a glance</h2></div><Button variant="ghost" size="sm" onClick={() => setLocation("/leads")} className="rounded-lg text-primary">View leads <ArrowRight className="ml-1 h-4 w-4" /></Button></div>
              <div className="mt-6 space-y-4">
                {stageMeta.map(stage => {
                  const record = byStage.get(stage.key);
                  const count = Number(record?.count ?? 0);
                  const width = Math.min(100, metrics.openLeadCount ? (count / Math.max(metrics.openLeadCount, 1)) * 100 : 0);
                  return <div key={stage.key} className="grid grid-cols-[1.1fr_3fr_auto] items-center gap-3"><span className="flex items-center gap-2 text-sm font-medium text-slate-700"><i className={`h-2.5 w-2.5 rounded-full ${stage.tone}`} />{stage.label}</span><span className="h-2 overflow-hidden rounded-full bg-slate-100"><i className={`block h-full rounded-full ${stage.tone}`} style={{ width: `${width}%` }} /></span><span className="w-6 text-right text-sm font-semibold tabular-nums text-slate-900">{count}</span></div>;
                })}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200/80 bg-white shadow-[0_12px_30px_-22px_rgba(15,23,42,0.35)]">
            <CardContent className="p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Action queue</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.03em] text-slate-950">Next up</h2></div><Button variant="ghost" size="sm" onClick={() => setLocation("/follow-ups")} className="rounded-lg text-primary">All tasks <ArrowRight className="ml-1 h-4 w-4" /></Button></div>{actionQueue.length ? <ul className="mt-5 divide-y divide-slate-100">{actionQueue.slice(0, 5).map(({ followUp, contactName }) => <li key={followUp.id} className="flex items-center gap-3 py-3 first:pt-0"><span className={`h-2 w-2 rounded-full ${new Date(followUp.dueAt) < new Date() ? "bg-amber-500" : "bg-primary"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{followUp.title}</p><p className="mt-0.5 truncate text-xs text-slate-500">{contactName} · {formatDate(followUp.dueAt)}</p></div></li>)}</ul> : <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">No active follow-ups yet. Create one from a lead to keep your next step visible.</p>}</CardContent>
          </Card>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Momentum</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.03em] text-slate-950">Recent activity</h2></div></div>
        {recentActivities.length ? <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{recentActivities.slice(0, 4).map(({ activity, contactName }) => <li key={activity.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"><Badge variant="secondary" className="rounded-md bg-white text-[10px] font-bold uppercase tracking-wide text-slate-500">{activityLabels[activity.type]}</Badge><p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-700">{activity.body}</p><p className="mt-3 text-xs font-medium text-slate-500">{contactName} · {formatDate(activity.occurredAt)}</p></li>)}</ul> : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Conversation history will appear here once you start logging activities.</p>}
      </section>
    </div>
  );
}
