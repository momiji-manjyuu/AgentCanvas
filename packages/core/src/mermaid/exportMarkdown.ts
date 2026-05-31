import type { DiagramDocument } from "../schema/diagram.js";
import { exportMermaid } from "./exportMermaid.js";

export function exportMarkdown(document: DiagramDocument): string {
  const taskLines =
    document.tasks.length === 0
      ? ["No tasks."]
      : document.tasks.map((task) => `- [${task.status === "done" ? "x" : " "}] ${task.title} (${task.status})`);
  const commentLines =
    document.comments.length === 0
      ? ["No comments."]
      : document.comments.map((comment) => `- ${comment.resolved ? "Resolved" : "Open"}: ${comment.text}`);
  const noteLines =
    document.notes.length === 0
      ? ["No notes."]
      : document.notes.map((note) => `- ${note.kind}: ${note.text}`);

  return [
    `# ${document.title}`,
    "",
    document.description ?? "",
    "",
    "```mermaid",
    exportMermaid(document).trimEnd(),
    "```",
    "",
    "## Tasks",
    "",
    ...taskLines,
    "",
    "## Notes",
    "",
    ...noteLines,
    "",
    "## Comments",
    "",
    ...commentLines,
    "",
  ].join("\n");
}
