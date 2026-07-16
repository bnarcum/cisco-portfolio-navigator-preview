/**
 * Click header logo to play Premium lockup intro (CSS animation; optional WebM/MP4).
 * Returns to Overview home only when the intro finishes on its own.
 */
(function () {
  "use strict";

  const INTRO_MS = 3200;
  const REDUCED_MS = 1600;

  function init() {
    const trigger = document.querySelector("button.logo");
    const overlay = document.getElementById("logo-intro");
    if (!trigger || !overlay) return;

    const animBlock = overlay.querySelector(".logo-intro-anim");
    const video = overlay.querySelector(".logo-intro-video");
    const staticImg = overlay.querySelector(".logo-intro-static");
    const skipBtn = overlay.querySelector(".logo-intro-skip");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let playing = false;
    let closeTimer = null;

    function clearCloseTimer() {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    }

    function goOverviewHome() {
      if (typeof window.cpnReturnToOverviewHome === "function") {
        window.cpnReturnToOverviewHome();
      } else if (typeof window.applyViewLevel === "function") {
        window.applyViewLevel("overview");
      }
    }

    function closeIntro(returnHome) {
      clearCloseTimer();
      overlay.classList.remove("is-active", "is-playing", "logo-intro-out");
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("logo-intro-open");
      playing = false;
      if (video) {
        video.onended = null;
        video.pause();
        video.currentTime = 0;
        video.hidden = true;
      }
      if (animBlock) animBlock.hidden = false;
      if (staticImg) staticImg.hidden = true;
      if (returnHome) goOverviewHome();
    }

    function finishIntro() {
      overlay.classList.add("logo-intro-out");
      setTimeout(() => closeIntro(true), 420);
    }

    function scheduleClose(ms) {
      clearCloseTimer();
      closeTimer = setTimeout(finishIntro, ms);
    }

    async function videoAvailable() {
      if (!video) return false;
      const sources = [...video.querySelectorAll("source")];
      for (const src of sources) {
        const url = src.getAttribute("src");
        if (!url) continue;
        try {
          const res = await fetch(url, { method: "HEAD", cache: "no-store" });
          if (res.ok) {
            src.setAttribute("data-ok", "1");
            return true;
          }
        } catch (e) { /* optional asset */ }
      }
      return false;
    }

    function playCssIntro() {
      if (animBlock) animBlock.hidden = false;
      if (video) video.hidden = true;
      if (staticImg) staticImg.hidden = true;
      overlay.classList.add("is-playing");
      scheduleClose(INTRO_MS);
    }

    function playStaticIntro() {
      if (animBlock) animBlock.hidden = true;
      if (video) video.hidden = true;
      if (staticImg) staticImg.hidden = false;
      scheduleClose(REDUCED_MS);
    }

    async function playVideoIntro() {
      if (animBlock) animBlock.hidden = true;
      if (staticImg) staticImg.hidden = true;
      video.hidden = false;
      video.currentTime = 0;
      video.onended = finishIntro;
      try {
        await video.play();
      } catch (e) {
        playCssIntro();
      }
    }

    async function openIntro() {
      if (playing) return;
      playing = true;
      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("logo-intro-open");
      requestAnimationFrame(() => overlay.classList.add("is-active"));

      if (reduced) {
        playStaticIntro();
        return;
      }

      if (await videoAvailable()) {
        await playVideoIntro();
        return;
      }

      playCssIntro();
    }

    trigger.addEventListener("click", openIntro);
    skipBtn?.addEventListener("click", () => closeIntro(false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeIntro(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closeIntro(false);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
