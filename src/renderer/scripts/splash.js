(function () {
  if (!window.electronAPI) return;

  const closeBtn = document.getElementById("splash-close-btn");
  const statusText = document.getElementById("splash-status-text");
  const spinner = document.querySelector(".splash-spinner");
  const versionLabel = document.getElementById("splash-version-label");
  const supportWebsite = document.getElementById("splash-support-website");
  const SUPPORT_WEBSITE_URL = "https://www.softasium.com";

  async function loadVersionLabel() {
    try {
      const info = await window.electronAPI.getAppInfo();
      if (!info || !versionLabel) return;
      const version = info.version || "—";
      const build =
        info.build != null && info.build !== "" ? ` (Build ${info.build})` : "";
      versionLabel.textContent = `Version v${version}${build}`;
    } catch (err) {
      console.error("[splash] failed to load app info", err);
    }
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.electronAPI.quitApp?.();
    });
  }

  if (supportWebsite) {
    supportWebsite.addEventListener("click", () => {
      void window.electronAPI.openExternalUrl?.(SUPPORT_WEBSITE_URL);
    });
  }

  // Restart the crossfade even when the same class is already present.
  function replayStatusAnimation() {
    if (!statusText) return;
    statusText.classList.remove("is-changing");
    void statusText.offsetWidth;
    statusText.classList.add("is-changing");
  }

  if (typeof window.electronAPI.onSplashStatus === "function") {
    window.electronAPI.onSplashStatus((payload) => {
      const text = typeof payload === "string" ? payload : payload && payload.text;
      const loading = typeof payload === "string" ? true : payload?.loading !== false;
      const denied = typeof payload === "object" && payload?.denied === true;

      if (statusText && typeof text === "string" && text && text !== statusText.textContent) {
        statusText.textContent = text;
        statusText.classList.toggle("splash-status-text--denied", denied);
        // The denied state owns the animation slot with its own shake.
        if (!denied) replayStatusAnimation();
      }
      if (spinner) {
        spinner.classList.toggle("is-hidden", !loading);
      }
    });
  }

  if (typeof window.electronAPI.onSplashFadeOut === "function") {
    window.electronAPI.onSplashFadeOut(() => {
      const panel = document.querySelector(".splash-panel");
      const report = () => window.electronAPI.notifySplashFaded?.();

      if (!panel) {
        report();
        return;
      }

      // transitionend may never fire under reduced motion, so cap the wait.
      const timer = setTimeout(report, 320);
      panel.addEventListener(
        "transitionend",
        (event) => {
          if (event.propertyName !== "opacity") return;
          clearTimeout(timer);
          report();
        },
        { once: true }
      );

      document.body.classList.add("is-leaving");
    });
  }

  loadVersionLabel();
})();
