export type { Connector, ConnectorContext, SyncResult } from "./base.js";
export { TodoistConnector } from "./todoist/index.js";
export { GoogleCalendarConnector } from "./google-calendar/index.js";
export { FileDropConnector } from "./file-drop/index.js";

import { TodoistConnector } from "./todoist/index.js";
import { GoogleCalendarConnector } from "./google-calendar/index.js";
import { FileDropConnector } from "./file-drop/index.js";
import type { Connector } from "./base.js";

export const allConnectors = (): Connector[] => [
  new TodoistConnector(),
  new GoogleCalendarConnector(),
  new FileDropConnector(),
];
