import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import { forgetDocument } from "../../memory/forget.js";

export const buildForgetDocumentTools = (deps: { storage: Storage }) => [
  tool(
    "forget_document",
    "Fully purge a previously ingested document and everything derived from it (extracted facts, measurements, embeddings, ingest-history record). Use when the user asks to delete a file or says ingested data is wrong/test data. Pass the document id (returned by `recall` with scope='documents', or from list_documents).",
    {
      id: z.string().min(1).describe("Document id (ULID)"),
    },
    async ({ id }) => {
      try {
        const result = forgetDocument(deps.storage, id);
        return {
          content: [
            {
              type: "text",
              text:
                `Forgot document ${result.documentId}\n` +
                `  facts removed:         ${result.factsRemoved}\n` +
                `  measurements removed:  ${result.measurementsRemoved}\n` +
                `  embedding refs:        ${result.embeddingRefsRemoved}\n` +
                `  vectors:               ${result.embeddingVectorsRemoved}\n` +
                `  ingest-history rows:   ${result.ingestedFilesRemoved}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `forget failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  ),
];
