import { NotImplementedError } from "@lifecoach/core";
import type { Connector, ConnectorContext, SyncResult } from "../base.js";

/**
 * Google Calendar connector.
 *
 * Wiring sketch:
 *   - OAuth via googleapis (one-time `lifecoach connect google-calendar`).
 *   - Pull events from primary calendar in a +/- N-day window around now.
 *   - For each event: write a document with title + description + attendees.
 *   - Add a fact only for recurring/notable events (filter by duration > 30m or labels).
 */
export class GoogleCalendarConnector implements Connector {
  readonly name = "google-calendar";
  readonly description = "Sync events from Google Calendar (not yet implemented)";

  async sync(_ctx: ConnectorContext): Promise<SyncResult> {
    throw new NotImplementedError(
      "GoogleCalendarConnector.sync",
      "see packages/connectors/src/google-calendar/index.ts for the wiring sketch",
    );
  }
}
