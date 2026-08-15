import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { pipelineStages, splitTags, type PipelineStage } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type ContactValues = {
  id?: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  companyId?: number | null;
  source?: string | null;
  estimatedValue?: string | number | null;
  stage?: string;
  notes?: string | null;
  tags?: { name: string }[];
};

const initialValues = { name: "", email: "", phone: "", companyId: "", source: "", estimatedValue: "", stage: "new" as PipelineStage, notes: "", tags: "" };
type FieldErrors = Partial<Record<"name" | "email" | "estimatedValue", string>>;

function getValues(contact?: ContactValues) {
  if (!contact) return initialValues;
  return {
    name: contact.name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    companyId: contact.companyId ? String(contact.companyId) : "",
    source: contact.source ?? "",
    estimatedValue: contact.estimatedValue ?? "",
    stage: (contact.stage ?? "new") as PipelineStage,
    notes: contact.notes ?? "",
    tags: contact.tags?.map(tag => tag.name).join(", ") ?? "",
  };
}

export default function ContactDialog({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (open: boolean) => void; contact?: ContactValues }) {
  const [values, setValues] = useState(getValues(contact));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const utils = trpc.useUtils();
  const companies = trpc.companies.list.useQuery(undefined, { enabled: open });

  useEffect(() => { if (open) { setValues(getValues(contact)); setError(null); setFieldErrors({}); } }, [contact, open]);

  const complete = () => {
    void utils.contacts.list.invalidate();
    if (contact?.id) void utils.contacts.get.invalidate({ id: contact.id });
    void utils.dashboard.get.invalidate();
    onOpenChange(false);
  };
  const create = trpc.contacts.create.useMutation({ onSuccess: () => { toast.success("Lead added to your pipeline"); complete(); }, onError: error => setError(error.message) });
  const update = trpc.contacts.update.useMutation({ onSuccess: () => { toast.success("Contact details saved"); complete(); }, onError: error => setError(error.message) });
  const saving = create.isPending || update.isPending;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    if (!values.name.trim()) nextErrors.name = "Enter a contact name.";
    if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) nextErrors.email = "Enter a valid email address.";
    const estimatedValue = values.estimatedValue === "" ? null : Number(values.estimatedValue);
    if (estimatedValue !== null && (!Number.isFinite(estimatedValue) || estimatedValue < 0)) nextErrors.estimatedValue = "Use zero or a positive amount.";
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); return; }
    setFieldErrors({});
    setError(null);
    const data = { name: values.name.trim(), email: values.email || undefined, phone: values.phone || undefined, companyId: values.companyId ? Number(values.companyId) : null, source: values.source || undefined, estimatedValue, stage: values.stage, notes: values.notes || undefined, tags: splitTags(values.tags) };
    if (contact?.id) update.mutate({ id: contact.id, data }); else create.mutate(data);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="font-display text-xl">{contact ? "Edit contact" : "Add a lead"}</DialogTitle><DialogDescription>{contact ? "Update the relationship details your future self will need." : "Capture the essentials now; you can add depth as the relationship develops."}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Name" required error={fieldErrors.name}><Input autoFocus aria-invalid={Boolean(fieldErrors.name)} value={values.name} onChange={event => { setValues({ ...values, name: event.target.value }); setFieldErrors({ ...fieldErrors, name: undefined }); }} placeholder="Jordan Lee" /></Field><Field label="Email" error={fieldErrors.email}><Input type="email" aria-invalid={Boolean(fieldErrors.email)} value={values.email} onChange={event => { setValues({ ...values, email: event.target.value }); setFieldErrors({ ...fieldErrors, email: undefined }); }} placeholder="jordan@company.com" /></Field><Field label="Phone"><Input value={values.phone} onChange={event => setValues({ ...values, phone: event.target.value })} placeholder="(555) 012-3456" /></Field><Field label="Company"><select value={values.companyId} onChange={event => setValues({ ...values, companyId: event.target.value })} className="crm-select"><option value="">No company yet</option>{companies.data?.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field><Field label="Stage"><select value={values.stage} onChange={event => setValues({ ...values, stage: event.target.value as PipelineStage })} className="crm-select">{pipelineStages.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></Field><Field label="Estimated value" error={fieldErrors.estimatedValue}><Input type="number" aria-invalid={Boolean(fieldErrors.estimatedValue)} min="0" step="0.01" value={values.estimatedValue} onChange={event => { setValues({ ...values, estimatedValue: event.target.value }); setFieldErrors({ ...fieldErrors, estimatedValue: undefined }); }} placeholder="0.00" /></Field><Field label="Source"><Input value={values.source} onChange={event => setValues({ ...values, source: event.target.value })} placeholder="Referral, website, event…" /></Field><Field label="Tags"><Input value={values.tags} onChange={event => setValues({ ...values, tags: event.target.value })} placeholder="Priority, design, Q3" /></Field></div><Field label="Notes"><Textarea value={values.notes} onChange={event => setValues({ ...values, notes: event.target.value })} placeholder="A short note to help you pick up the conversation…" rows={4} /></Field>{error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : contact ? "Save changes" : "Add lead"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) { return <div className="space-y-2"><Label className="text-sm font-semibold text-slate-700">{label}{required && <span className="text-primary"> *</span>}</Label>{children}{error && <p role="alert" className="text-xs font-medium text-rose-600">{error}</p>}</div>; }
