# Request Logging for HTTP Bridge

## Goal

Add structured request/response logging to all HTTP Bridge endpoints so we can observe how the AI agent uses the API — call frequency, code granularity, execution timing, and error patterns.

## Design

### What to log

Every request to `/execute`, `/command`, `/screenshot`, and `/join-channel` logs a single structured JSON line via pino with these fields:

| Field | Type | Description |
|---|---|---|
| `requestId` | string | UUID v4, unique per request |
| `endpoint` | string | e.g. `/execute`, `/command` |
| `codeLength` | number | Length of `code` field (execute only) |
| `codePreview` | string | First 120 chars of code (execute only) |
| `command` | string | Command name (command only) |
| `timeout` | number | Requested timeout in ms |
| `targetFile` | string? | fileKey or fileName if specified |
| `durationMs` | number | Wall-clock time from request start to response |
| `success` | boolean | Whether the operation succeeded |
| `errorMessage` | string? | Error message on failure |
| `responseSize` | number | Byte length of JSON response body |
| `statusCode` | number | HTTP status code returned |

### Output

Pino structured JSON to stdout (default pino behavior). Pipe to file if needed:

```bash
npm run start:http 2>&1 | tee logs/bridge.jsonl
```

Analyze with jq:

```bash
# Slowest requests
jq -s 'sort_by(-.durationMs) | .[0:10]' logs/bridge.jsonl

# Code length distribution
jq '.codeLength // empty' logs/bridge.jsonl | sort -n

# Error rate
jq -s '[.[] | .success] | group_by(.) | map({(.[0] | tostring): length})' logs/bridge.jsonl
```

### Implementation

- Add a `logRequest` wrapper function in `http-bridge.ts`
- Wrap each endpoint handler to capture timing and response metadata
- No new dependencies — uses existing pino logger

### Non-goals

- No persistent log storage (stdout only)
- No dashboard or UI
- No log rotation (user pipes to file if needed)

## Future context

This logging will inform:
1. Whether `/batch` or coarser-grained prompting is needed
2. Which dead code can be safely removed
3. Performance baseline before Tauri packaging
