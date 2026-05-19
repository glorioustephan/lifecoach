import { NotImplementedError } from "@lifecoach/core";
import type { Connector, ConnectorContext, SyncResult } from "../base.js";

/**
 * Todoist connector.
 *
 * Wiring sketch:
 *   - Read TODOIST_API_TOKEN from env.
 *   - GET https://api.todoist.com/rest/v2/tasks (filter by ?filter=...)
 *   - Map each task → a fact (category: 'task', subject: task name, data: {due, priority})
 *     OR a document for richer notes. Use task.id as part of fact.source to dedupe.
 *   - Track sync cursor in storage.meta (e.g. last_sync_unix) so we only pull deltas.
 */
export class TodoistConnector implements Connector {
  readonly name = "todoist";
  readonly description = "Sync tasks from Todoist (not yet implemented)";

  async sync(_ctx: ConnectorContext): Promise<SyncResult> {
    throw new NotImplementedError(
      "TodoistConnector.sync",
      "see packages/connectors/src/todoist/index.ts for the wiring sketch",
    );
  }
}
