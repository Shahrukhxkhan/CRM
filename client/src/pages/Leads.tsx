import ContactDialog from "@/components/crm/ContactDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, pipelineStages, stageLabel, type PipelineStage } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { CircleDollarSign, Download, FileUp, Plus, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";

export default function Leads() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PipelineStage | "all">("all");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const contacts = trpc.contacts.list.useQuery({ query: query || undefined, stage: filter === "all" ? undefined : filter });
  const moveStage = trpc.contacts.changeStage.useMutation({ onSuccess: () => { toast.success("Pipeline stage updated"); void utils.contacts.list.invalidate(); void utils.dashboard.get.invalidate(); }, onError: error => toast.error(error.message) });
  const exportCsv = trpc.contacts.exportCsv.useQuery(undefined, { enabled: false });
  const importCsv = trpc.contacts.importCsv.useMutation({
    onSuccess: result => {
      setImportResult(result);
      if (result.created) { void utils.contacts.list.invalidate(); void utils.companies.list.invalidate(); void utils.dashboard.get.invalidate(); }
    },
    onError: error => toast.error(`CSV import failed: ${error.message}`),
  });
  const grouped = useMemo(() => pipelineStages.map(stage => ({ ...stage, contacts: (contacts.data ?? []).filter(row => row.contact.stage === stage.value) })), [contacts.data]);

  useEffect(() => { if (search.includes("create=1")) setCreateOpen(true); }, [search]);

  function changeStage(id: number, stage: PipelineStage) { moveStage.mutate({ id, stage }); }
  async function downloadCsv() {
    const result = await exportCsv.refetch();
    if (!result.data) { toast.error("Your contact export could not be prepared."); return; }
    const blob = new Blob([result.data], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `soloflow-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("Contact CSV downloaded");
  }
  async function selectImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Choose a .csv file."); return; }
    if (file.size > 1_000_000) { toast.error("Choose a CSV file smaller than 1 MB."); return; }
    importCsv.mutate({ csv: await file.text() });
  }
  function moveWithKeyboard(event: React.KeyboardEvent<HTMLElement>, id: number, currentStage: PipelineStage) {
    if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = pipelineStages.findIndex(stage => stage.value === currentStage);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextStage = pipelineStages[currentIndex + direction];
    if (nextStage) changeStage(id, nextStage.value);
  }
  return <div className="mx-auto max-w-[1600px] space-y-7"><header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">Relationship workspace</p><h1 className="page-title">Leads with their full context.</h1><p className="page-subtitle">Move opportunities forward while keeping every detail connected.</p></div><div className="flex flex-wrap gap-2"><input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={selectImportFile} className="sr-only" aria-label="Choose a contact CSV file" /><Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importCsv.isPending} className="h-11 rounded-xl bg-white"><FileUp className="mr-2 h-4 w-4" />{importCsv.isPending ? "Importing…" : "Import CSV"}</Button><Button variant="outline" onClick={downloadCsv} disabled={exportCsv.isFetching} className="h-11 rounded-xl bg-white"><Download className="mr-2 h-4 w-4" />{exportCsv.isFetching ? "Preparing…" : "Export CSV"}</Button><Button onClick={() => setCreateOpen(true)} className="h-11 rounded-xl shadow-lg shadow-primary/20"><Plus className="mr-2 h-4 w-4" /> Add lead</Button></div></header><section className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={event => setQuery(event.target.value)} className="h-10 border-0 bg-slate-50 pl-9 shadow-none" placeholder="Search name, email, or company" /></div><select value={filter} onChange={event => setFilter(event.target.value as PipelineStage | "all")} className="crm-select h-10 sm:w-44"><option value="all">All stages</option>{pipelineStages.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></section>{contacts.isError ? <ErrorState onRetry={() => contacts.refetch()} /> : contacts.isLoading ? <BoardSkeleton /> : !contacts.data?.length ? <EmptyState onCreate={() => setCreateOpen(true)} /> : <section className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-7 sm:px-7 lg:-mx-10 lg:px-10"><p className="mb-3 text-xs text-slate-500">Drag cards between stages, choose a stage from the dropdown, or focus a card and use <kbd className="rounded border bg-white px-1 font-mono">Alt + ←/→</kbd> to move it one stage.</p><div className="grid min-w-[1220px] grid-cols-6 gap-4">{grouped.map(stage => <div key={stage.value} className="rounded-2xl bg-slate-200/45 p-3" onDragOver={event => event.preventDefault()} onDrop={() => { if (draggedId) changeStage(draggedId, stage.value); setDraggedId(null); }}><div className="mb-3 flex items-center justify-between px-1"><span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><i className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />{stage.label}</span><Badge variant="secondary" className="rounded-md bg-white text-xs text-slate-500">{stage.contacts.length}</Badge></div><div className="min-h-32 space-y-3">{stage.contacts.map(({ contact, company }) => <article key={contact.id} draggable tabIndex={0} aria-label={`${contact.name}, ${stageLabel(contact.stage)} stage. Use Alt plus left or right arrow to move between stages.`} onKeyDown={event => moveWithKeyboard(event, contact.id, contact.stage as PipelineStage)} onDragStart={() => setDraggedId(contact.id)} onDragEnd={() => setDraggedId(null)} className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-[0_8px_16px_-14px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"><button onClick={() => setLocation(`/leads/${contact.id}`)} className="w-full text-left focus-visible:outline-none"><p className="truncate text-sm font-semibold text-slate-800">{contact.name}</p><p className="mt-1 truncate text-xs text-slate-500">{company?.name || contact.email || "No company yet"}</p></button><div className="mt-3 flex items-center justify-between gap-2"><span className="flex items-center gap-1 text-xs font-medium text-slate-500"><CircleDollarSign className="h-3.5 w-3.5" />{formatMoney(contact.estimatedValue)}</span><select aria-label={`Change stage for ${contact.name}`} value={contact.stage} onChange={event => changeStage(contact.id, event.target.value as PipelineStage)} className="h-7 max-w-24 rounded-md border border-slate-200 bg-white px-1 text-[11px] font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{pipelineStages.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></article>)}</div></div>)}</div></section>}<ContactDialog open={isCreateOpen} onOpenChange={setCreateOpen} /><CsvImportResult result={importResult} onClose={() => setImportResult(null)} /></div>;
}

function BoardSkeleton() { return <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-72 rounded-2xl" />)}</div>; }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <section className="rounded-2xl border border-rose-100 bg-rose-50 p-10 text-center"><p className="font-display text-xl font-semibold text-slate-900">The lead list did not load.</p><p className="mt-2 text-sm text-slate-600">Please check your connection and try again. No records were changed.</p><Button className="mt-5" onClick={onRetry}>Try again</Button></section>; }
function EmptyState({ onCreate }: { onCreate: () => void }) { return <section className="rounded-[1.5rem] border border-dashed border-primary/25 bg-white px-6 py-14 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><UsersRound className="h-6 w-6" /></span><h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.035em] text-slate-950">No leads here yet.</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Add a person or business opportunity and SoloFlow will give it a clear home in your pipeline.</p><Button onClick={onCreate} className="mt-6 rounded-xl"><Plus className="mr-2 h-4 w-4" /> Add your first lead</Button></section>; }
function CsvImportResult({ result, onClose }: { result: { created: number; errors: { row: number; message: string }[] } | null; onClose: () => void }) { return <Dialog open={Boolean(result)} onOpenChange={open => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle className="font-display text-xl">CSV import results</DialogTitle><DialogDescription>{result?.errors.length ? "No records were imported because the rows below need correction." : "The contact import completed successfully."}</DialogDescription></DialogHeader>{result?.errors.length ? <ul className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-rose-50 p-3">{result.errors.map(error => <li key={`${error.row}-${error.message}`} className="text-sm text-rose-700"><strong>Row {error.row}:</strong> {error.message}</li>)}</ul> : <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><strong>{result?.created ?? 0}</strong> contacts were added to your private workspace. Companies named in the CSV were linked or created as needed.</p>}<DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter></DialogContent></Dialog>; }
