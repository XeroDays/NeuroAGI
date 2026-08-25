const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const {
  BENCHMARK_PROMPT,
  LLM_OPTIONS,
  formatSeconds,
  preview,
  probeModel,
} = require("../src/main/services/latency-benchmark-service");

const PROJECT_ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(PROJECT_ROOT, "models-catalog.json");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

async function benchmarkModel(modelEntry, index, total) {
  const { name: model, type } = modelEntry;
  const apiKey = process.env.OPENROUTER_API_KEY;

  console.log(`\n[${index}/${total}] → ${model} (${type})`);
  console.log(`  Sending request…`);

  const result = await probeModel(modelEntry, apiKey);

  if (result.status === "ok") {
    console.log(`  ✓ Completed in ${formatSeconds(result.elapsedMs)}s`);
    console.log(`    status: 200, finish_reason: ${result.finishReason}`);
    console.log(
      `    content: ${result.contentLength} chars, reasoning: ${result.reasoningLength} chars`
    );
    console.log(`    preview: ${result.note}`);
  } else {
    console.log(
      `  ✗ Failed in ${formatSeconds(result.elapsedMs)}s — ${result.note}`
    );
  }

  return result;
}

function printSummary(results, totalRunMs) {
  const successCount = results.filter((r) => r.status === "ok").length;
  const failureCount = results.length - successCount;
  const sorted = [...results].sort((a, b) => a.elapsedMs - b.elapsedMs);

  console.log("\n" + "=".repeat(72));
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(72));
  console.log(`Models tested : ${results.length}`);
  console.log(`Successful    : ${successCount}`);
  console.log(`Failed        : ${failureCount}`);
  console.log(`Total run time: ${formatSeconds(totalRunMs)}s`);
  console.log("");

  const rankCol = "Rank".padEnd(5);
  const modelCol = "Model".padEnd(48);
  const typeCol = "Type".padEnd(6);
  const timeCol = "Time".padEnd(8);
  const statusCol = "Status".padEnd(8);
  console.log(`${rankCol}${modelCol}${typeCol}${timeCol}${statusCol}Note`);
  console.log("-".repeat(72));

  sorted.forEach((result, i) => {
    const rank = String(i + 1).padEnd(5);
    const model = result.model.padEnd(48).slice(0, 48);
    const type = result.type.padEnd(6);
    const time = `${formatSeconds(result.elapsedMs)}s`.padEnd(8);
    const status = result.status.padEnd(8);
    console.log(`${rank}${model}${type}${time}${status}${result.note}`);
  });

  console.log("=".repeat(72));
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error(
      "OPENROUTER_API_KEY is not set. Add it to the .env file in the project root."
    );
    process.exit(1);
  }

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`Catalog not found: ${CATALOG_PATH}`);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  if (!Array.isArray(catalog) || catalog.length === 0) {
    console.error("models-catalog.json is empty or invalid.");
    process.exit(1);
  }

  console.log("NeuroAGI Model Latency Benchmark");
  console.log(`Catalog: ${catalog.length} models`);
  console.log(`Prompt : ${preview(BENCHMARK_PROMPT, 80)}`);
  console.log(`Options: stream=false, reasoning=${LLM_OPTIONS.reasoning.effort}, max_tokens=${LLM_OPTIONS.maxTokens}`);

  const runStartedAt = Date.now();
  const results = [];

  for (let i = 0; i < catalog.length; i++) {
    const result = await benchmarkModel(catalog[i], i + 1, catalog.length);
    results.push(result);
  }

  const totalRunMs = Date.now() - runStartedAt;
  printSummary(results, totalRunMs);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(PROJECT_ROOT, `benchmark-results-${timestamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        totalRunMs,
        prompt: BENCHMARK_PROMPT,
        options: LLM_OPTIONS,
        results,
      },
      null,
      2
    )
  );
  console.log(`\nResults saved to: ${reportPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Benchmark failed:", err?.message || String(err));
    process.exit(1);
  });
}
