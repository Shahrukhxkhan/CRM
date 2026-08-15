import { contactInputSchema } from "./validation";

export const CONTACT_CSV_HEADERS = ["name", "email", "phone", "company", "source", "estimated_value", "stage", "tags", "notes"] as const;
export const MAX_CONTACT_CSV_BYTES = 1_000_000;
export const MAX_CONTACT_CSV_ROWS = 1_000;

export type CsvImportError = { row: number; message: string };
export type ParsedContactCsvRow = {
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source?: string;
  estimatedValue?: number;
  stage?: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
  tags: string[];
  notes?: string;
};

function parseCsvCells(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];
    if (character === '"') {
      if (quoted && nextCharacter === '"') { cell += '"'; index += 1; } else { quoted = !quoted; }
    } else if (character === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("An opening quote is missing its closing quote.");
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) { return value.trim().toLowerCase().replace(/^\uFEFF/, ""); }
function csvValue(value: string | null | undefined) { return `"${(value ?? "").replaceAll('"', '""')}"`; }

export function parseContactCsv(csvText: string): { rows: ParsedContactCsvRow[]; errors: CsvImportError[] } {
  if (new TextEncoder().encode(csvText).byteLength > MAX_CONTACT_CSV_BYTES) {
    return { rows: [], errors: [{ row: 0, message: "The CSV file exceeds the 1 MB import limit." }] };
  }

  let rawRows: string[][];
  try { rawRows = parseCsvCells(csvText); } catch (error) { return { rows: [], errors: [{ row: 0, message: error instanceof Error ? error.message : "The CSV could not be parsed." }] }; }
  if (rawRows.length < 2) return { rows: [], errors: [{ row: 0, message: "Add a header row and at least one contact row." }] };
  if (rawRows.length - 1 > MAX_CONTACT_CSV_ROWS) return { rows: [], errors: [{ row: 0, message: `Import at most ${MAX_CONTACT_CSV_ROWS} contacts at a time.` }] };

  const headers = rawRows[0].map(normalizeHeader);
  const indexFor = (header: string) => headers.indexOf(header);
  if (indexFor("name") === -1) return { rows: [], errors: [{ row: 1, message: "The CSV header must include a name column." }] };
  const valueFor = (cells: string[], header: string) => { const index = indexFor(header); return index === -1 ? "" : (cells[index] ?? "").trim(); };
  const rows: ParsedContactCsvRow[] = [];
  const errors: CsvImportError[] = [];

  rawRows.slice(1).forEach((cells, zeroIndex) => {
    const row = zeroIndex + 2;
    const estimatedValueText = valueFor(cells, "estimated_value");
    const candidate = {
      name: valueFor(cells, "name"),
      email: valueFor(cells, "email") || undefined,
      phone: valueFor(cells, "phone") || undefined,
      source: valueFor(cells, "source") || undefined,
      estimatedValue: estimatedValueText === "" ? undefined : Number(estimatedValueText),
      stage: valueFor(cells, "stage") || undefined,
      notes: valueFor(cells, "notes") || undefined,
      tags: valueFor(cells, "tags").split(";").map(tag => tag.trim()).filter(Boolean),
    };
    const parsed = contactInputSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ row, message: parsed.error.issues.map(issue => issue.message).join(" ") });
      return;
    }
    const { companyId: _ignoredCompanyId, estimatedValue, ...validated } = parsed.data;
    rows.push({ ...validated, estimatedValue: estimatedValue ?? undefined, companyName: valueFor(cells, "company") || undefined, tags: parsed.data.tags ?? [] });
  });
  return { rows, errors };
}

export function createContactCsv(rows: Array<{ name: string; email: string | null; phone: string | null; company: string | null; source: string | null; estimatedValue: string | null; stage: string; tags: string[]; notes: string | null }>) {
  return [
    CONTACT_CSV_HEADERS.join(","),
    ...rows.map(row => [row.name, row.email, row.phone, row.company, row.source, row.estimatedValue, row.stage, row.tags.join(";"), row.notes].map(csvValue).join(",")),
  ].join("\r\n");
}
