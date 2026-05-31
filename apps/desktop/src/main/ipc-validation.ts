import {
  DiagramDocumentSchema,
  DiagramPatchOpSchema,
  type DiagramDocument,
  type DiagramPatchOp,
} from "@agent-canvas/core";
import { z } from "zod";

export const NonEmptyStringSchema = z.string().min(1);
export const OptionalSlugSchema = z.string().min(1).optional();

export const ImportMermaidInputSchema = z.object({
  title: NonEmptyStringSchema,
  source: NonEmptyStringSchema,
  slug: OptionalSlugSchema,
});

export const DiagramPatchOpsSchema = DiagramPatchOpSchema.array();

export function parseIpcInput<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || label}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid ${label}: ${details}`);
  }
  return result.data;
}

export function parseDiagramDocument(value: unknown, label = "diagram"): DiagramDocument {
  return parseIpcInput(DiagramDocumentSchema, value, label) as DiagramDocument;
}

export function parseDiagramPatchOps(value: unknown, label = "ops"): DiagramPatchOp[] {
  return parseIpcInput(DiagramPatchOpsSchema, value, label) as DiagramPatchOp[];
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "The request could not be completed.";
}
