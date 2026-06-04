# Model Latency Benchmark

This guide explains how to run the OpenRouter latency benchmark for every model listed in `models-catalog.json`.

## Prerequisites

1. **Node.js** installed (same environment used for the NeuroAGI app).
2. **Dependencies installed** — run once from the project root:

   ```bash
   npm install
   ```

3. **OpenRouter API key** — create a `.env` file in the project root:

   ```env
   OPENROUTER_API_KEY=sk-or-...
   ```

   The script reads this key automatically. Without it, the benchmark exits with an error.

## Run the benchmark

From the project root:

```bash
npm run benchmark:latency
```

This runs `scripts/benchmark-latency.js`, which tests **every model** in `models-catalog.json` (Free and Paid), one at a time.

## What the script does

For each model it:

1. Sends a non-streaming chat completion request to OpenRouter.
2. Uses the same fixed prompt for all models so latency is comparable.
3. Sets `stream: false` and `reasoning: { effort: "medium" }`.
4. Waits for the full response before moving to the next model.
5. Logs progress, elapsed time, and a short content preview.

### Fixed prompt

Every model receives this user message:

```
Count the number of letters in the word "characteristically".
Think carefully and verify your count.
After you have finished, reply with exactly: OK
```

## Console output

While running, you will see logs like:

```
[3/18] → poolside/laguna-xs.2:free (Free)
  Sending request…
  ✓ Completed in 5.27s
    status: 200, finish_reason: stop
    content: 291 chars, reasoning: 829 chars
    preview: I'll count the letters in "characteristically"…
```

If a model fails (HTTP error, network issue, etc.), the script logs the error and **continues** with the remaining models.

## Summary report

When all models finish, a table is printed sorted by elapsed time (fastest first), showing:

- Rank
- Model name
- Type (Free / Paid)
- Elapsed time
- Status (`ok` or `error`)
- Brief note (response preview or error message)

## Results file

A JSON report is saved in the project root:

```
benchmark-results-<timestamp>.json
```

Example: `benchmark-results-2026-06-04T09-52-42-868Z.json`

This file contains:

- Run timestamp and total wall-clock time
- The prompt and request options used
- Per-model results (`elapsedMs`, `status`, `finishReason`, content lengths, etc.)

Use this file to update `models-catalog.json` — for example, remove models that returned errors and refresh latency values from successful runs.

## Expected runtime

The full run can take several minutes. Some models respond in under 2 seconds; others may take 90+ seconds. The script runs sequentially, so total time depends on how many models are in the catalog and how fast each endpoint responds.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `OPENROUTER_API_KEY is not set` | Add the key to `.env` in the project root. |
| `Catalog not found` | Run the command from the project root, not from `scripts/`. |
| HTTP 404 / 451 errors for specific models | Those endpoints may be unavailable or region-restricted. Remove them from the catalog or skip them when reviewing results. |
| Very long run times | Normal for large catalogs or slow models. Watch the live logs to track progress. |

## Related files

| File | Purpose |
|------|---------|
| `scripts/benchmark-latency.js` | Benchmark script |
| `models-catalog.json` | List of models to test |
| `.env` | OpenRouter API key (not committed to git) |
| `benchmark-results-*.json` | Generated run reports |
