function formatCost(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num === 0) return 'USD 0';
  return `USD ${num.toString()}`;
}

function formatTokens(n) {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return '0 tokens';
  return `${num.toLocaleString()} tokens`;
}

function mountBubbles() {
  if (document.querySelector('.usage-bubbles')) return null;

  const container = document.createElement('div');
  container.className = 'usage-bubbles';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');

  const tokensEl = document.createElement('div');
  tokensEl.className = 'usage-bubble tokens-bubble';
  tokensEl.title = 'Total tokens consumed across all API calls';
  tokensEl.textContent = formatTokens(0);

  const costEl = document.createElement('div');
  costEl.className = 'usage-bubble cost-bubble';
  costEl.title = 'Total USD spent across all API calls';
  costEl.textContent = formatCost(0);

  container.appendChild(tokensEl);
  container.appendChild(costEl);
  document.body.appendChild(container);

  return { tokensEl, costEl };
}

async function init() {
  const els = mountBubbles();
  if (!els) return;

  if (!window.electronAPI?.getUsageTotals || !window.electronAPI?.onUsageUpdate) {
    console.warn('[usage-bubbles] electronAPI usage helpers not exposed');
    return;
  }

  try {
    const totals = await window.electronAPI.getUsageTotals();
    if (totals) {
      els.costEl.textContent = formatCost(totals.totalUSD);
      els.tokensEl.textContent = formatTokens(totals.totalTokens);
    }
  } catch (err) {
    console.warn('[usage-bubbles] initial getUsageTotals failed:', err);
  }

  const off = window.electronAPI.onUsageUpdate(({ totalUSD, totalTokens } = {}) => {
    els.costEl.textContent = formatCost(totalUSD);
    els.tokensEl.textContent = formatTokens(totalTokens);
  });

  window.addEventListener('beforeunload', () => {
    try { off(); } catch {}
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
