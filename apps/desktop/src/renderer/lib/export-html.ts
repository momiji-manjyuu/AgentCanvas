import type { DiagramDocument } from "@agent-canvas/core";

export function exportDiagramHtml(document: DiagramDocument, pngDataUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(document.title)}</title>
  <style>
    body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f8fafc; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px; }
    img { width: 100%; height: auto; border: 1px solid #dbe3ee; background: #fff; }
    section { margin-top: 28px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 0 0 10px; font-size: 16px; text-transform: uppercase; letter-spacing: 0; color: #475569; }
    p, li { line-height: 1.55; }
    ul { padding-left: 20px; }
    .meta { color: #64748b; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(document.title)}</h1>
    ${document.description ? `<p class="meta">${escapeHtml(document.description)}</p>` : ""}
    <img alt="${escapeHtml(document.title)}" src="${pngDataUrl}" />
    ${section("Tasks", document.tasks.map((task) => `${task.title} (${task.status})`))}
    ${section("Notes", document.notes.map((note) => `${note.kind}: ${note.text}`))}
    ${section(
      "Comments",
      document.comments.map((comment) => `${comment.resolved ? "Resolved" : "Open"}: ${comment.text}`),
    )}
  </main>
</body>
</html>
`;
}

function section(title: string, items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  return `<section><h2>${escapeHtml(title)}</h2><ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul></section>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
