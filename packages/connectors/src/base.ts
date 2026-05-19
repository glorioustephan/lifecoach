import type { Storage } from "@lifecoach/core";

export interface ConnectorContext {
  storage: Storage;
}

export interface SyncResult {
  documentsAdded: number;
  factsAdded: number;
  measurementsAdded: number;
  notes?: string;
}

export interface Connector {
  /** Stable identifier used in CLI commands and config */
  readonly name: string;
  /** Human-friendly description for status output */
  readonly description: string;
  /** Pull data from the upstream system and persist into memory */
  sync(ctx: ConnectorContext): Promise<SyncResult>;
}
