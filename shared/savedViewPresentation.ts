export type SavedViewEntityType = "contacts" | "tasks" | "deals";

export function getSavedViewPresentationMode(entityType: SavedViewEntityType) {
  const supportsGrouping = entityType !== "contacts";
  return { supportsGrouping, summary: supportsGrouping ? "Columns & grouping" : "Columns" };
}
