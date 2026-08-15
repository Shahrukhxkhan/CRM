import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Building2, ChevronRight, Globe2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

type CompanyValues = { id?: number; name: string; website?: string | null; phone?: string | null; address?: string | null; notes?: string | null };
type CompanyErrors = Partial<Record<"name" | "website", string>>;
const blank = { name: "", website: "", phone: "", address: "", notes: "" };

function valuesFor(company?: CompanyValues) {
  return company ? { name: company.name, website: company.website ?? "", phone: company.phone ?? "", address: company.address ?? "", notes: company.notes ?? "" } : blank;
}

function CompanyDialog({ open, onOpenChange, company }: { open: boolean; onOpenChange: (open: boolean) => void; company?: CompanyValues }) {
  const [values, setValues] = useState(valuesFor(company));
  const [fieldErrors, setFieldErrors] = useState<CompanyErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  useEffect(() => { if (open) { setValues(valuesFor(company)); setFieldErrors({}); setSubmitError(null); } }, [company, open]);
  const done = () => { toast.success(company ? "Company details saved" : "Company created"); onOpenChange(false); void utils.companies.list.invalidate(); if (company?.id) void utils.companies.get.invalidate({ id: company.id }); };
  const create = trpc.companies.create.useMutation({ onSuccess: done, onError: error => setSubmitError(error.message) });
  const update = trpc.companies.update.useMutation({ onSuccess: done, onError: error => setSubmitError(error.message) });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const errors: CompanyErrors = {};
    if (!values.name.trim()) errors.name = "Enter a company name.";
    if (values.website && !/^https?:\/\//.test(values.website)) errors.website = "Start the website with http:// or https://.";
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setFieldErrors({}); setSubmitError(null);
    const data = { name: values.name.trim(), website: values.website || undefined, phone: values.phone || undefined, address: values.address || undefined, notes: values.notes || undefined };
    if (company?.id) update.mutate({ id: company.id, data }); else create.mutate(data);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle className="font-display text-xl">{company ? "Edit company" : "Add company"}</DialogTitle><DialogDescription>Group related people under the organization they work with.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><Field label="Company name" error={fieldErrors.name}><Input autoFocus aria-invalid={Boolean(fieldErrors.name)} value={values.name} onChange={event => { setValues({ ...values, name: event.target.value }); setFieldErrors({ ...fieldErrors, name: undefined }); }} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Website" error={fieldErrors.website}><Input aria-invalid={Boolean(fieldErrors.website)} value={values.website} onChange={event => { setValues({ ...values, website: event.target.value }); setFieldErrors({ ...fieldErrors, website: undefined }); }} placeholder="https://example.com" /></Field><Field label="Phone"><Input value={values.phone} onChange={event => setValues({ ...values, phone: event.target.value })} /></Field></div><Field label="Address"><Textarea value={values.address} onChange={event => setValues({ ...values, address: event.target.value })} rows={2} /></Field><Field label="Notes"><Textarea value={values.notes} onChange={event => setValues({ ...values, notes: event.target.value })} rows={3} /></Field>{submitError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{submitError}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? "Saving…" : "Save company"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

export default function Companies() {
  const [, setLocation] = useLocation(); const companies = trpc.companies.list.useQuery(); const [createOpen, setCreateOpen] = useState(false);
  if (companies.isLoading) return <div className="space-y-4"><Skeleton className="h-20 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>;
  return <div className="mx-auto max-w-6xl space-y-7"><header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">Organizations</p><h1 className="page-title">Companies and the people in them.</h1><p className="page-subtitle">Keep a shared client context without losing the person-to-person detail.</p></div><Button onClick={() => setCreateOpen(true)} className="h-11 rounded-xl"><Plus className="mr-2 h-4 w-4" /> Add company</Button></header>{companies.isError ? <section className="rounded-2xl bg-rose-50 p-10 text-center"><p className="font-semibold">Companies did not load.</p><Button onClick={() => companies.refetch()} className="mt-4">Try again</Button></section> : !companies.data?.length ? <section className="rounded-[1.5rem] border border-dashed border-primary/25 bg-white px-6 py-14 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-6 w-6" /></span><h2 className="mt-5 font-display text-2xl font-semibold">No companies yet.</h2><p className="mt-2 text-sm text-slate-600">Create a company, then connect its contacts as relationships take shape.</p><Button onClick={() => setCreateOpen(true)} className="mt-6"><Plus className="mr-2 h-4 w-4" /> Add company</Button></section> : <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"><div className="divide-y divide-slate-100">{companies.data.map(company => <button key={company.id} onClick={() => setLocation(`/companies/${company.id}`)} className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-slate-50"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Building2 className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-800">{company.name}</span><span className="mt-1 block truncate text-sm text-slate-500">{company.website || company.phone || "No website or phone"}</span></span><ChevronRight className="h-5 w-5 text-slate-300" /></button>)}</div></section>}<CompanyDialog open={createOpen} onOpenChange={setCreateOpen} /></div>;
}

export function CompanyDetail() {
  const [, params] = useRoute("/companies/:id"); const [, setLocation] = useLocation(); const id = Number(params?.id); const company = trpc.companies.get.useQuery({ id }, { enabled: !!id }); const [editOpen, setEditOpen] = useState(false); const utils = trpc.useUtils();
  const remove = trpc.companies.delete.useMutation({ onSuccess: () => { toast.success("Company deleted; contacts were retained"); void utils.companies.list.invalidate(); setLocation("/companies"); }, onError: error => toast.error(error.message) });
  if (company.isLoading) return <Skeleton className="mx-auto h-96 max-w-5xl rounded-2xl" />;
  if (company.isError || !company.data) return <section className="py-24 text-center"><h1 className="page-title">We couldn’t open this company.</h1><Button onClick={() => setLocation("/companies")} variant="outline" className="mt-6">Back to companies</Button></section>;
  const data = company.data;
  return <div className="mx-auto max-w-5xl space-y-6"><Button onClick={() => setLocation("/companies")} variant="ghost" className="-ml-3 text-slate-500"><ChevronRight className="mr-1 h-4 w-4 rotate-180" /> Back to companies</Button><section className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-5 sm:flex-row"><div className="flex items-start gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Building2 className="h-7 w-7" /></span><div><h1 className="page-title">{data.name}</h1>{data.website && <a href={data.website} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><Globe2 className="h-4 w-4" />{data.website}</a>}</div></div><div className="flex gap-2"><Button variant="outline" onClick={() => setEditOpen(true)}>Edit</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="border-rose-200 text-rose-700"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {data.name}?</AlertDialogTitle><AlertDialogDescription>Contacts will remain in your workspace, but will no longer be linked to this company.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate({ id })} className="bg-destructive text-white">Delete company</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></div>{data.notes && <p className="mt-6 border-t border-slate-100 pt-5 text-sm leading-6 text-slate-600">{data.notes}</p>}</section><section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><p className="eyebrow">Relationships</p><h2 className="mt-1 font-display text-xl font-semibold">Associated contacts</h2></div><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-600">{data.contacts.length}</span></div>{data.contacts.length ? <div className="mt-5 divide-y divide-slate-100">{data.contacts.map(contact => <button onClick={() => setLocation(`/leads/${contact.id}`)} key={contact.id} className="flex w-full items-center justify-between py-4 text-left hover:text-primary"><span><span className="block font-semibold text-slate-800">{contact.name}</span><span className="mt-1 block text-sm text-slate-500">{contact.email || contact.phone || "No contact details"}</span></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>)}</div> : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No contacts are linked to this company yet.</p>}</section><CompanyDialog open={editOpen} onOpenChange={setEditOpen} company={data} /></div>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <div className="space-y-2"><Label className="font-semibold text-slate-700">{label}</Label>{children}{error && <p role="alert" className="text-xs font-medium text-rose-600">{error}</p>}</div>; }
