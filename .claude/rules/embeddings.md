---
paths:
  - "packages/core/src/embeddings/**"
---

# Embeddings Rules

Rules for all work in the Voyage AI embeddings client, embed/rerank utilities, and the LRU cache layer.

## Dimension validation

Always validate the embedding dimension before insert or search:

```ts
const dim = vec.length;
const expected = parseInt(process.env.VOYAGE_EMBED_DIM ?? '1024', 10);
if (dim !== expected) {
  throw new Error(`Embedding dim mismatch: got ${dim}, expected ${expected}`);
}
```

This check must run in the embedding layer, not in callers. Callers should not handle dim errors.

## Batching

- Maximum **128 documents per API call** to the Voyage embed endpoint.
- For larger sets, split into batches of 128 and issue calls sequentially (not in parallel) to avoid rate-limit bursts.
- Always pass `input_type: 'document'` for corpus chunks and `input_type: 'query'` for search queries. Never omit `input_type`.

## Retry policy for 429 and 5xx

Use exponential backoff with jitter for transient errors:

- **Retryable statuses:** 429, 500, 502, 503, 504.
- **Max attempts:** 5.
- **Base delay:** 500 ms. Delay formula: `base * 2^(attempt-1) + random(0, base)`.
- **Non-retryable:** 400, 401, 403, 404 — surface immediately as an error; do not retry.
- Log each retry attempt at `warn` level with attempt number and delay.

## Text sanitisation

Before embedding, sanitise input text:

1. Strip control characters (Unicode category `Cc`) except `\n` and `\t`.
2. Remove lone surrogates (U+D800–U+DFFF not followed by a valid pair partner).
3. Truncate to the model's token limit if the text is unusually long (log a `warn`).

Sanitise in a dedicated `sanitizeForEmbedding(text: string): string` utility; call it in the embedding layer before any API call.

## Secret hygiene

- **Never log raw API keys.** No `console.log(process.env.VOYAGE_API_KEY)` or equivalent.
- Redact key values in error messages: `key=VOYAGE_API_KEY[redacted]`.
- Unit tests must use a fake/stub API key, never a real credential.

## LRU cache

The embedding cache key must be: `<model>:<dim>:<sha256(input)>`

- Use a fixed-size LRU (default capacity 512 entries) to avoid unbounded memory growth.
- The cache is in-process only; do not persist it to disk or share across processes.
- Cache hits must skip the dim-validation step (the cached vector is already validated).
- Invalidate the entire cache when `VOYAGE_EMBED_DIM` or the active model changes at startup.

## Observability

- Log every embed call at `debug` level: `{ model, inputCount, dim, durationMs }`.
- Log every rerank call at `debug` level: `{ model, candidateCount, topK, durationMs }`.
- Surface retry events at `warn` level with context.
- Emit no `info`-level noise on the happy path; keep prod logs clean.
