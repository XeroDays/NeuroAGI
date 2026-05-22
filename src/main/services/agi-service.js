const { chatCompletion, streamChat } = require("./api-helper");

const OPENROUTER_WORKER_MODELS = [
  // "poolside/laguna-xs.2:free", 
 //"google/gemini-2.5-flash-lite", // not free
 //"deepseek/deepseek-v4-flash", // not free
 // "openai/gpt-4o-mini", // not free
 //"google/gemini-3-flash-preview", //not free
  // "arcee-ai/trinity-large-thinking:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
];

//const OPENROUTER_MASTER_MODEL = "deepseek/deepseek-v4-flash";
const OPENROUTER_MASTER_MODEL = "google/gemini-2.5-flash-lite";

async function AskAllWorkerAgis(prompt, options = {}) {
  const messages = [{ role: "user", content: prompt }];
  const startedAt = Date.now();
  console.log(`[agi] fanout → ${OPENROUTER_WORKER_MODELS.length} worker models`);

  const settled = await Promise.allSettled(
    OPENROUTER_WORKER_MODELS.map((model) =>
      chatCompletion(messages, model, options)
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

async function AskMasterAgi(prompt, options = {}) {
  console.log(`[agi] master query → ${OPENROUTER_MASTER_MODEL}`);
  return chatCompletion(
    [{ role: "user", content: prompt }],
    OPENROUTER_MASTER_MODEL,
    options
  );
}

function StreamFromAllWorkerAgis(prompt, callbacks = {}, options = {}) {
  const {
    onModelDelta = () => {},
    onModelDone = () => {},
    onModelError = () => {},
    onAllDone = () => {},
  } = callbacks;

  const messages = [{ role: "user", content: prompt }];
  const models = OPENROUTER_WORKER_MODELS.slice();
  const startedAt = Date.now();

  console.log(`[agi] stream-fanout → ${models.length} worker model(s)`);

  if (models.length === 0) {
    console.warn("[agi] stream-fanout: OPENROUTER_WORKER_MODELS is empty");
    queueMicrotask(() => onAllDone({ models: [], elapsedMs: 0 }));
    return models;
  }

  let remaining = models.length;
  const okSet = new Set();
  const errSet = new Set();

  const settle = (model, kind) => {
    if (okSet.has(model) || errSet.has(model)) return;
    if (kind === "ok") okSet.add(model);
    else errSet.add(model);
    remaining -= 1;
    if (remaining <= 0) {
      console.log(
        `[agi] stream-fanout complete: ${okSet.size}/${models.length} succeeded in ${Date.now() - startedAt}ms`
      );
      try {
        onAllDone({
          models,
          okModels: Array.from(okSet),
          errorModels: Array.from(errSet),
          elapsedMs: Date.now() - startedAt,
        });
      } catch (cbErr) {
        console.error("[agi] stream-fanout onAllDone callback threw:", cbErr);
      }
    }
  };

  for (const model of models) {
    try {
      streamChat(
        messages,
        model,
        (delta) => {
          try {
            onModelDelta(model, delta);
          } catch (cbErr) {
            console.error(
              `[agi] stream-fanout onModelDelta callback threw for ${model}:`,
              cbErr
            );
          }
        },
        () => {
          try {
            onModelDone(model);
          } catch (cbErr) {
            console.error(
              `[agi] stream-fanout onModelDone callback threw for ${model}:`,
              cbErr
            );
          } finally {
            settle(model, "ok");
          }
        },
        (err) => {
          const msg = err?.message || String(err);
          console.warn(`[agi] stream-fanout worker ${model} errored:`, msg);
          try {
            onModelError(model, msg);
          } catch (cbErr) {
            console.error(
              `[agi] stream-fanout onModelError callback threw for ${model}:`,
              cbErr
            );
          } finally {
            settle(model, "err");
          }
        },
        options
      );
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[agi] stream-fanout failed to start ${model}:`, msg);
      try {
        onModelError(model, msg);
      } catch (cbErr) {
        console.error(
          `[agi] stream-fanout onModelError callback threw for ${model}:`,
          cbErr
        );
      } finally {
        settle(model, "err");
      }
    }
  }

  return models;
}

module.exports = {
  AskAllWorkerAgis,
  AskMasterAgi,
  StreamFromAllWorkerAgis,
  OPENROUTER_WORKER_MODELS,
  OPENROUTER_MASTER_MODEL,
};
