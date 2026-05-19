import { NotImplementedError } from "@lifecoach/core";
import type { Connector, ConnectorContext, SyncResult } from "../base.js";

/**
 * File-drop connector.
 *
 * Wiring sketch:
 *   - Watch data/raw/ with chokidar.
 *   - On file add: route through IngestPipeline (packages/core/src/ingest/pipeline.ts).
 *   - Track processed paths in storage.meta so we never double-ingest.
 *   - On startup: do a single pass over existing files for first-run catchup.
 */
export class FileDropConnector implements Connector {
  readonly name = "file-drop";
  readonly description = "Watch data/raw/ for new files (not yet implemented)";

  async sync(_ctx: ConnectorContext): Promise<SyncResult> {
    throw new NotImplementedError(
      "FileDropConnector.sync",
      "see packages/connectors/src/file-drop/index.ts for the wiring sketch",
    );
  }
}
