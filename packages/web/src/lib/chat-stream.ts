// Thin SSE reader for /api/chat/send. We match the server's ChatEvent shape:
//   { type: 'text-delta',  text }
//   { type: 'tool-start',  toolUseId, name, input }
//   { type: 'tool-result', toolUseId, output?, error? }
//   { type: 'done',        toolCallCount }
//   { type: 'error',       message }
//
// Plus a synthetic 'session' event the server sends first.

export type ChatEvent =
  | { type: "session"; sessionId: string }
  | { type: "text-delta"; text: string }
  | { type: "tool-start"; toolUseId: string; name: string; input: unknown }
  | { type: "tool-result"; toolUseId: string; output?: unknown; error?: string }
  | { type: "done"; toolCallCount: number }
  | { type: "error"; message: string };

export interface SendOptions {
  sessionId?: string;
  message: string;
  signal?: AbortSignal;
  onEvent: (event: ChatEvent) => void;
}

/**
 * Open a streaming chat send. Yields back through `onEvent`. Throws if the
 * initial request fails; mid-stream parse errors are surfaced as a synthetic
 * error event.
 */
export const sendChat = async (opts: SendOptions): Promise<void> => {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
      message: opts.message,
    }),
  };
  if (opts.signal) init.signal = opts.signal;

  const resp = await fetch("/api/chat/send", init);
  if (!resp.ok || !resp.body) {
    throw new Error(`chat/send: ${resp.status} ${resp.statusText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const drainFrames = (): void => {
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      handleChunk(chunk, opts.onEvent);
      boundary = buffer.indexOf("\n\n");
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    drainFrames();
  }

  // EOF flush: a server that closes the connection right after the last event
  // (or a network hiccup that drops the trailing blank line) used to leave the
  // final SSE frame stranded in `buffer`, which surfaced as a mid-word
  // truncation in the UI. Decode any pending UTF-8 bytes, drain any complete
  // frames, then process anything that still looks like a valid frame.
  buffer += decoder.decode();
  drainFrames();
  if (buffer.trim().length > 0 && /(^|\n)data:/.test(buffer)) {
    handleChunk(buffer, opts.onEvent);
  }
};

const handleChunk = (chunk: string, onEvent: (e: ChatEvent) => void): void => {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;
  const raw = dataLines.join("\n");
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Server sets event name in the `event:` line; the data carries the body.
    // For the synthetic session event the data is `{ sessionId }` (no type field).
    if (event === "session" && typeof parsed["sessionId"] === "string") {
      onEvent({ type: "session", sessionId: parsed["sessionId"] });
      return;
    }
    if (typeof parsed["type"] === "string") {
      onEvent(parsed as unknown as ChatEvent);
    }
  } catch {
    onEvent({ type: "error", message: `failed to parse SSE chunk` });
  }
};
