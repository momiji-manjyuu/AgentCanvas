import { placeAddedNodesNearConnections } from "../layout/autoLayout.js";
import { DiagramDocumentSchema, type DiagramDocument, type DiagramPatchOp } from "../schema/diagram.js";
import { applyPatch } from "./applyPatch.js";
import { diffDocuments, type DiagramDiffSummary } from "./diff.js";

export interface PatchPreviewResult {
  previewDocument: DiagramDocument | null;
  diff: DiagramDiffSummary | null;
  validation: {
    ok: boolean;
    errors: string[];
  };
}

export function previewPatch(document: DiagramDocument, ops: DiagramPatchOp[]): PatchPreviewResult {
  try {
    const preview = applyPatch(document, ops, { updateTimestamp: false });
    const withLayout = placeAddedNodesNearConnections(document, preview);
    const parsed = DiagramDocumentSchema.parse(withLayout);
    return {
      previewDocument: parsed,
      diff: diffDocuments(document, parsed),
      validation: { ok: true, errors: [] },
    };
  } catch (error) {
    return {
      previewDocument: null,
      diff: null,
      validation: {
        ok: false,
        errors: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}
