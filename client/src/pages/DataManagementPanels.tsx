import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Check, Edit3, Layers3, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ContactsPage } from "./Workspace";
import { ReportsDashboardPanel } from "./ReportsDashboardPanel";

type ContactRow = {
  contact: {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
    leadSource: string | null;
    companyId: number | null;
    relationshipStage: string;
    archivedAt: Date | null;
  };
};

function parseArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function ContactOperationsPanel() {
  const utils = trpc.useUtils();
  const contactsQuery = trpc.crm.contacts.list.useQuery({ includeArchived: true });
  const companies = trpc.crm.companies.list.useQuery();
  const lists = trpc.crm.lists.list.useQuery();
  const definitions = trpc.crm.contacts.customFields.list.useQuery();
  const duplicates = trpc.crm.contacts.duplicateCandidates.useQuery();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editorId, setEditorId] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [survivorId, setSurvivorId] = useState("");
  const [bulkAction, setBulkAction] = useState<"archive" | "restore" | "relationshipStage" | "addToList">("archive");
  const [bulkStage, setBulkStage] = useState("Lead");
  const [bulkListId, setBulkListId] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", jobTitle: "", leadSource: "", companyId: "", relationshipStage: "Lead" });
  const rows = (contactsQuery.data ?? []) as ContactRow[];
  const selected = rows.find(row => row.contact.id === editorId)?.contact;
  const detail = trpc.crm.contacts.get.useQuery({ id: editorId ?? 0 }, { enabled: Boolean(editorId) });
  const preview = trpc.crm.contacts.mergePreview.useQuery(
    { sourceId: Number(sourceId), survivorId: Number(survivorId) },
    { enabled: Boolean(sourceId && survivorId && sourceId !== survivorId) }
  );

  useEffect(() => {
    if (!selected) return;
    setForm({
      firstName: selected.firstName,
      lastName: selected.lastName,
      email: selected.email ?? "",
      phone: selected.phone ?? "",
      jobTitle: selected.jobTitle ?? "",
      leadSource: selected.leadSource ?? "",
      companyId: selected.companyId ? String(selected.companyId) : "",
      relationshipStage: selected.relationshipStage,
    });
  }, [selected]);

  const refresh = () => {
    utils.crm.contacts.list.invalidate();
    utils.crm.contacts.duplicateCandidates.invalidate();
    utils.crm.dashboard.invalidate();
  };
  const bulk = trpc.crm.contacts.bulkUpdate.useMutation({
    onSuccess: result => { refresh(); setSelectedIds([]); toast.success(`${result.affected} contact(s) updated.`); },
    onError: error => toast.error(error.message),
  });
  const merge = trpc.crm.contacts.merge.useMutation({
    onSuccess: () => { refresh(); setSourceId(""); setSurvivorId(""); toast.success("Relationships were reassigned to the selected survivor."); },
    onError: error => toast.error(error.message),
  });
  const update = trpc.crm.contacts.update.useMutation({
    onSuccess: () => { refresh(); if (editorId) utils.crm.contacts.get.invalidate({ id: editorId }); toast.success("Contact updated."); },
    onError: error => toast.error(error.message),
  });
  const setValue = trpc.crm.contacts.customFields.setValue.useMutation({
    onSuccess: () => { if (editorId) utils.crm.contacts.get.invalidate({ id: editorId }); toast.success("Custom value saved."); },
    onError: error => toast.error(error.message),
  });
  const duplicateContacts = duplicates.data?.flatMap(group => group.matches) ?? [];
  const multiselects = useMemo(() => {
    const saved = new Map(detail.data?.values.map(item => [item.definition.id, item.value.valueJson]) ?? []);
    return (definitions.data ?? []).filter(definition => definition.fieldType === "multiselect").map(definition => ({ definition, valueJson: saved.get(definition.id) ?? "[]" }));
  }, [definitions.data, detail.data]);

  function toggleContact(id: number) {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  return <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">Data management workspace</h2><p className="mt-1 text-sm text-muted-foreground">Edit records, review normalized-email duplicates, preview merges, and apply safe bulk actions.</p></div>
      <Badge variant="secondary">{duplicates.data?.length ?? 0} duplicate groups</Badge>
    </div>
    <div className="mt-5 grid gap-6 xl:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Bulk contact actions</h3>
          <div className="mt-3 max-h-40 space-y-2 overflow-auto">
            {rows.map(({ contact }) => <label key={contact.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedIds.includes(contact.id)} onChange={() => toggleContact(contact.id)}/><span>{contact.firstName} {contact.lastName}</span>{contact.archivedAt && <Badge variant="outline">Archived</Badge>}</label>)}
            {!rows.length && <p className="text-sm text-muted-foreground">Add or import contacts first.</p>}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select value={bulkAction} onChange={event => setBulkAction(event.target.value as typeof bulkAction)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="archive">Archive selected</option><option value="restore">Restore selected</option><option value="relationshipStage">Set relationship stage</option><option value="addToList">Add to static list</option></select>
            {bulkAction === "relationshipStage" ? <Input value={bulkStage} onChange={event => setBulkStage(event.target.value)} placeholder="Relationship stage"/> : bulkAction === "addToList" ? <select value={bulkListId} onChange={event => setBulkListId(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">Choose list</option>{lists.data?.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select> : <div/>}
          </div>
          <Button className="mt-3" disabled={!selectedIds.length || bulk.isPending || (bulkAction === "addToList" && !bulkListId)} onClick={() => bulk.mutate({ ids: selectedIds, action: bulkAction, relationshipStage: bulkAction === "relationshipStage" ? bulkStage : undefined, listId: bulkAction === "addToList" ? Number(bulkListId) : undefined })}><Layers3 className="mr-2 h-4 w-4"/>Apply to {selectedIds.length} selected</Button>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Duplicate review & merge preview</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select value={sourceId} onChange={event => setSourceId(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">Choose duplicate source</option>{duplicateContacts.map(contact => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName} · {contact.email}</option>)}</select>
            <select value={survivorId} onChange={event => setSurvivorId(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">Choose survivor</option>{duplicateContacts.filter(contact => String(contact.id) !== sourceId).map(contact => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName} · {contact.email}</option>)}</select>
          </div>
          {preview.data && <p className="mt-3 rounded-md bg-muted p-3 text-sm">Move <strong>{preview.data.impact.activities}</strong> activities, <strong>{preview.data.impact.tasks}</strong> tasks, <strong>{preview.data.impact.deals}</strong> deals, <strong>{preview.data.impact.attachments}</strong> attachments, and <strong>{preview.data.impact.listMemberships}</strong> list memberships.</p>}
          <Button className="mt-3" disabled={!preview.data || merge.isPending} onClick={() => merge.mutate({ sourceId: Number(sourceId), survivorId: Number(survivorId) })}><UsersRound className="mr-2 h-4 w-4"/>Confirm merge</Button>
        </div>
      </div>
      <div className="rounded-lg border p-4">
        <h3 className="font-medium">Contact editor</h3>
        <select className="mt-3 h-9 w-full rounded-md border bg-background px-3 text-sm" value={editorId ?? ""} onChange={event => setEditorId(event.target.value ? Number(event.target.value) : null)}><option value="">Choose contact</option>{rows.map(({ contact }) => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName}</option>)}</select>
        {selected && <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><Input value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })}/><Input value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })}/><Input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/><Input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })}/><Input value={form.jobTitle} onChange={event => setForm({ ...form, jobTitle: event.target.value })}/><Input value={form.leadSource} onChange={event => setForm({ ...form, leadSource: event.target.value })} placeholder="Lead source"/><select value={form.companyId} onChange={event => setForm({ ...form, companyId: event.target.value })} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">No company</option>{companies.data?.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select><Input value={form.relationshipStage} onChange={event => setForm({ ...form, relationshipStage: event.target.value })} placeholder="Relationship stage"/></div>
          <Button className="mt-3" disabled={update.isPending} onClick={() => update.mutate({ id: selected.id, data: { ...form, companyId: form.companyId ? Number(form.companyId) : null } })}><Edit3 className="mr-2 h-4 w-4"/>Save contact</Button>
          {multiselects.map(item => { const options = item.definition.optionsJson ? parseArray(item.definition.optionsJson) : []; const selectedValues = parseArray(item.valueJson); return <div key={item.definition.id} className="mt-4 border-t pt-4"><Label>{item.definition.label}</Label><select multiple value={selectedValues} onChange={event => setValue.mutate({ contactId: selected.id, definitionId: item.definition.id, value: Array.from(event.currentTarget.selectedOptions).map(option => option.value) })} className="mt-2 h-28 w-full rounded-md border bg-background px-3 text-sm">{options.map(option => <option key={option} value={option}>{option}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">Hold Ctrl/Cmd to choose multiple values.</p></div>; })}
        </>}
      </div>
    </div>
  </section>;
}

export function ContactsWorkspace() { return <><ContactsPage/><ContactOperationsPanel/><ReportsDashboardPanel/></>; }

export function DealDataManagementPanel() {
  const utils = trpc.useUtils();
  const deals = trpc.crm.deals.list.useQuery();
  const contacts = trpc.crm.contacts.list.useQuery({ includeArchived: false });
  const companies = trpc.crm.companies.list.useQuery();
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const selected = deals.data?.records.find(record => record.deal.id === Number(id));
  useEffect(() => { if (selected) { setTitle(selected.deal.title); setAmount(String(selected.deal.amount)); setContactId(String(selected.deal.contactId)); setCompanyId(selected.deal.companyId ? String(selected.deal.companyId) : ""); setCloseDate(selected.deal.expectedCloseAt ? new Date(selected.deal.expectedCloseAt).toISOString().slice(0, 10) : ""); } }, [selected]);
  const update = trpc.crm.deals.update.useMutation({ onSuccess: () => { utils.crm.deals.list.invalidate(); toast.success("Deal updated."); }, onError: error => toast.error(error.message) });
  return <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm"><h2 className="font-semibold">Deal editor</h2><p className="mt-1 text-sm text-muted-foreground">Update commercial details without changing audited pipeline stage history.</p><select value={id} onChange={event => setId(event.target.value)} className="mt-4 h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="">Choose a deal</option>{deals.data?.records.map(record => <option key={record.deal.id} value={record.deal.id}>{record.deal.title}</option>)}</select>{selected && <div className="mt-4 grid gap-3 md:grid-cols-2"><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Deal title"/><Input type="number" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Amount"/><select value={contactId} onChange={event => setContactId(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">{contacts.data?.map(({ contact }) => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName}</option>)}</select><select value={companyId} onChange={event => setCompanyId(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">No company</option>{companies.data?.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select><Input type="date" value={closeDate} onChange={event => setCloseDate(event.target.value)}/><Button disabled={update.isPending} onClick={() => update.mutate({ id: selected.deal.id, title, amount: Number(amount), contactId: Number(contactId), companyId: companyId ? Number(companyId) : null, expectedCloseAt: closeDate ? new Date(`${closeDate}T12:00:00`) : null })}><Check className="mr-2 h-4 w-4"/>Save deal</Button></div>}</section>;
}
