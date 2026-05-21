const { chatCompletion } = require("./api-helper");

const OPENROUTER_WORKER_MODELS = [
  // "poolside/laguna-xs.2:free", 
  // "openai/gpt-oss-120b:free",
  // "arcee-ai/trinity-large-thinking:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

const OPENROUTER_MASTER_MODEL = "arcee-ai/trinity-large-thinking:free";

async function AskAllWorkerAgis(prompt) {
  const messages = [{ role: "user", content: prompt }];
  const startedAt = Date.now();
  console.log(`[agi] fanout → ${OPENROUTER_WORKER_MODELS.length} worker models`);

  const settled = await Promise.allSettled(
    OPENROUTER_WORKER_MODELS.map((model) =>
      chatCompletion(messages, model)
        .then((content) => ({ model, ok: true, content }))
        .catch((err) => ({
          model,
          ok: false,
          error: err?.message || String(err),
        }))
    )
  );

  const results = settled.map((r) => r.value);
  const okCount = results.filter((r) => r.ok).length;
  console.log(
    `[agi] fanout complete: ${okCount}/${results.length} succeeded in ${Date.now() - startedAt}ms`
  );
  return results;
}

async function AskMasterAgi(prompt) {
  console.log(`[agi] master query → ${OPENROUTER_MASTER_MODEL}`);
  return chatCompletion(
    [{ role: "user", content: prompt }],
    OPENROUTER_MASTER_MODEL
  );
}

module.exports = {
  AskAllWorkerAgis,
  AskMasterAgi,
  OPENROUTER_WORKER_MODELS,
  OPENROUTER_MASTER_MODEL,
};
