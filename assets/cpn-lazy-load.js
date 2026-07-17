/**
 * Lazy-load heavy modules (Three.js, Design Studio) on first use.
 */
(function () {
  "use strict";

  function assetV() {
    return window.__CPN_BUILD || "dev";
  }

  function loadScript(src) {
    const base = src.split("?")[0];
    const url = src.includes("?") ? src : `${base}?v=${assetV()}`;
    if (document.querySelector(`script[src^="${base}"]`)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${base}`));
      document.body.appendChild(s);
    });
  }

  function loadStylesheet(href) {
    const base = href.split("?")[0];
    const url = href.includes("?") ? href : `${base}?v=${assetV()}`;
    if (document.querySelector(`link[href^="${base}"]`)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = url;
      l.onload = () => resolve();
      l.onerror = () => reject(new Error(`Failed to load ${base}`));
      document.head.appendChild(l);
    });
  }

  const DS_SCRIPTS = [
    "assets/family-heroes.js",
    "design-studio-photos.js",
    "design-studio-stencils.js",
    "design-studio-templates.js",
    "design-studio-rules.js",
    "design-studio-intent.js",
    "design-studio-explore.js",
    "design-studio-premium.js",
    "design-studio-expert.js",
    "design-studio-walk-layout.js",
    "design-studio-walk-voxel.js",
    "design-studio-field-panel.js",
    "design-studio-walk-audio.js",
    "design-studio-walk-models.js",
    "design-studio-walk-quest.js",
    "design-studio-walk.js",
    "design-studio.js"
  ];

  let dsPromise = null;
  let threePromise = null;

  async function loadDesignStudio() {
    if (window.__CPN_ROOM_MODE) {
      throw new Error("Design Studio is disabled in room mode");
    }
    if (window.DesignStudio) return window.DesignStudio;
    if (dsPromise) return dsPromise;
    dsPromise = (async () => {
      await loadStylesheet("design-studio.css");
      window.__DS_ASSET_V = assetV();
      for (const src of DS_SCRIPTS) {
        await loadScript(src);
      }
      if (typeof window.initDesignStudio === "function") {
        window.initDesignStudio();
      }
      return window.DesignStudio;
    })().catch(err => {
      dsPromise = null;
      throw err;
    });
    return dsPromise;
  }

  async function loadThree() {
    if (window.__cpnWalkTHREE) return window.__cpnWalkTHREE;
    if (threePromise) return threePromise;
    threePromise = (async () => {
      const url = new URL("vendor/three.module.min.js", document.baseURI).href;
      const mod = await import(/* webpackIgnore: true */ url);
      window.__cpnWalkTHREE = mod;
      return mod;
    })().catch(err => {
      threePromise = null;
      throw err;
    });
    return threePromise;
  }

  window.__cpnLazy = { loadDesignStudio, loadThree, loadScript, loadStylesheet };
  window.ensureDesignStudio = loadDesignStudio;
})();
