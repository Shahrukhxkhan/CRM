import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { FileCheck2, Save, Trash2 } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ImportsPage } from "./Workspace";

type RawRow = { rowNumber: number; values: Record<string, string> };
type Mapping = Record<"firstName" | "lastName" | "email" | "phone" | "jobTitle" | "leadSource" | "relationshipStage", string>;
type Transform = "trim" | "lowercase" | "uppercase";
type ValidationResult = { id: number; summary: { totalRows: number; createCount: number; updateCount: number; skipCount: number; errorCount: number }; hasErrors: boolean };
const fields: { key: keyof Mapping; label: string; required?: boolean }[] = [
  { key: "firstName", label: "First name", required: true }, { key: "lastName", label: "Last name", required: true }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "jobTitle", label: "Job title" }, { key: "leadSource", label: "Lead source" }, { key: "relationshipStage", label: "Relationship stage" },
];

function parseCsvRecords(text: string) {
  const records: string[][] = [[]]; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) { const char = text[index]; const next = text[index + 1]; if (char === '"' && quoted && next === '"') { value += '"'; index += 1; continue; } if (char === '"') { quoted = !quoted; continue; } if (char === "," && !quoted) { records[records.length - 1].push(value); value = ""; continue; } if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index += 1; records[records.length - 1].push(value); value = ""; records.push([]); continue; } value += char; }
  records[records.length - 1].push(value);
  return records.filter(record => record.some(cell => cell.trim()));
}

function parseFlatCsv(text: string) {
  const records = parseCsvRecords(text);
  const headers = (records[0] ?? []).map(value => value.trim());
  const rows = records.slice(1).map((record, index) => ({ rowNumber: index + 2, values: Object.fromEntries(headers.map((header, position) => [header, record[position]?.trim() ?? ""])) }));
  return { headers, rows };
}

export function ImportDataQualityPanel() {
  const utils = trpc.useUtils();
  const profiles = trpc.crm.imports.profiles.list.useQuery();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [filename, setFilename] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileId, setProfileId] = useState("");
  const [strategy, setStrategy] = useState<"create" | "update" | "skip">("skip");
  const [mapping, setMapping] = useState<Mapping>({ firstName: "firstName", lastName: "lastName", email: "email", phone: "phone", jobTitle: "jobTitle", leadSource: "leadSource", relationshipStage: "relationshipStage" });
  const [transforms, setTransforms] = useState<Partial<Record<keyof Mapping, Transform>>>({ email: "lowercase" });
  const [result, setResult] = useState<ValidationResult | null>(null);
  const validate = trpc.crm.imports.validateMapped.useMutation({ onSuccess: data => { setResult(data as ValidationResult); utils.crm.imports.list.invalidate(); toast.success("Validation report saved without changing contacts."); }, onError: error => toast.error(error.message) });
  const createProfile = trpc.crm.imports.profiles.create.useMutation({ onSuccess: () => { utils.crm.imports.profiles.list.invalidate(); toast.success("Mapping profile saved."); }, onError: error => toast.error(error.message) });
  const updateProfile = trpc.crm.imports.profiles.update.useMutation({ onSuccess: () => { utils.crm.imports.profiles.list.invalidate(); toast.success("Mapping profile updated."); }, onError: error => toast.error(error.message) });
  const removeProfile = trpc.crm.imports.profiles.remove.useMutation({ onSuccess: () => { utils.crm.imports.profiles.list.invalidate(); setProfileId(""); toast.success("Mapping profile removed."); }, onError: error => toast.error(error.message) });
  const selectedProfile = useMemo(() => profiles.data?.find(profile => profile.id === Number(profileId)), [profiles.data, profileId]);
  useEffect(() => { if (!selectedProfile) return; try { setProfileName(selectedProfile.name); setMapping(JSON.parse(selectedProfile.mappingJson) as Mapping); setTransforms(JSON.parse(selectedProfile.transformsJson) as Partial<Record<keyof Mapping, Transform>>); setStrategy(selectedProfile.duplicateStrategy); } catch { toast.error("This saved mapping profile is invalid."); } }, [selectedProfile]);
  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const parsed = parseFlatCsv(await file.text()); setFilename(file.name); setHeaders(parsed.headers); setRows(parsed.rows); setResult(null); setMapping(current => Object.fromEntries(fields.map(field => [field.key, parsed.headers.includes(current[field.key]) ? current[field.key] : ""])) as Mapping); };
  const canValidate = rows.length > 0 && Boolean(mapping.firstName && mapping.lastName);
  return <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">CSV mapping & data quality</h2><p className="mt-1 text-sm text-muted-foreground">Map arbitrary source columns, save profiles, transform values, and record a validation-only report before committing data.</p></div><Badge variant="secondary">No contact writes</Badge></div><div className="mt-5 grid gap-6 xl:grid-cols-2"><div><label className="flex h-10 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground"><span className="truncate">{filename || "Choose CSV for mapping"}</span><input type="file" accept=".csv,text/csv" className="sr-only" onChange={chooseFile}/></label><div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map(field => <div key={field.key}><Label className="text-xs">{field.label}{field.required ? " *" : ""}</Label><select value={mapping[field.key]} onChange={event => setMapping(current => ({ ...current, [field.key]: event.target.value }))} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="">Do not map</option>{headers.map(header => <option key={header} value={header}>{header}</option>)}</select></div>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label className="text-xs">Duplicate resolution</Label><select value={strategy} onChange={event => setStrategy(event.target.value as typeof strategy)} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="skip">Skip matches</option><option value="update">Update matches</option><option value="create">Create duplicate</option></select></div>{fields.map(field => <div key={`transform-${field.key}`}><Label className="text-xs">{field.label} transform</Label><select value={transforms[field.key] ?? ""} onChange={event => setTransforms(current => ({ ...current, [field.key]: event.target.value ? event.target.value as Transform : undefined }))} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="">No transform</option><option value="trim">Trim</option><option value="lowercase">Lowercase & trim</option><option value="uppercase">Uppercase & trim</option></select></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><Button disabled={!canValidate || validate.isPending} onClick={() => validate.mutate({ filename: filename || "validation.csv", mapping, transforms, duplicateStrategy: strategy, rows })}><FileCheck2 className="mr-2 h-4 w-4"/>Validate {rows.length || ""} rows</Button><Input className="max-w-xs" value={profileName} onChange={event => setProfileName(event.target.value)} placeholder="Mapping profile name"/><Button variant="outline" disabled={!profileName || !headers.length || createProfile.isPending} onClick={() => createProfile.mutate({ name: profileName, sourceHeaders: headers, mapping, transforms, duplicateStrategy: strategy })}><Save className="mr-2 h-4 w-4"/>Save profile</Button>{selectedProfile && <Button variant="outline" disabled={!profileName || !headers.length || updateProfile.isPending} onClick={() => updateProfile.mutate({ id: selectedProfile.id, name: profileName, sourceHeaders: headers, mapping, transforms, duplicateStrategy: strategy })}>Update profile</Button>}</div></div><div><h3 className="font-medium">Saved profiles & report</h3><select value={profileId} onChange={event => setProfileId(event.target.value)} className="mt-3 h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="">Choose saved profile</option>{profiles.data?.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>{selectedProfile && <Button className="mt-2" size="sm" variant="ghost" disabled={removeProfile.isPending} onClick={() => removeProfile.mutate({ id: selectedProfile.id })}><Trash2 className="mr-1 h-3.5 w-3.5"/>Remove profile</Button>}{result ? <div className="mt-4 rounded-lg border p-4 text-sm"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><p><strong>{result.summary.totalRows}</strong><br/>rows</p><p><strong>{result.summary.createCount}</strong><br/>create</p><p><strong>{result.summary.updateCount}</strong><br/>update</p><p><strong>{result.summary.errorCount}</strong><br/>errors</p></div><p className="mt-3 text-muted-foreground">Report #{result.id} is saved in import history. Resolve errors or reuse this mapping before using the normal commit workflow.</p></div> : <p className="mt-4 text-sm text-muted-foreground">Choose a CSV to create a validation-only report.</p>}</div></div></section>;
}

export function ImportsWorkspace() { return <><ImportsPage/><ImportDataQualityPanel/></>; }
