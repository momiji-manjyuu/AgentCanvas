export function stableJson(value: unknown): string {
  return JSON.stringify(sortForJson(value), null, 2);
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortForJson(item)]),
    );
  }
  return value;
}
