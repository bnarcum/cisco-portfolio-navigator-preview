/**
 * Node-attached outcome card — "Problems this solves" on the graph canvas.
 * One primary problem (+ expand), persona framing, and a consolidated Journey row:
 * Explore graph → Prove on dCloud → Investigate in AI Canvas → Skill up.
 */
(function () {
  "use strict";

  let activeFamilyId = null;
  let expandedMore = false;
  let anchorNode = null;

  function cardEl() {
    return document.getElementById("outcome-card");
  }

  function nodeScreenPosition(d) {
    if (!d || d.x == null || d.y == null) return null;
    const gw = document.getElementById("gw");
    const svg = document.getElementById("gs");
    if (!gw || !svg || typeof d3 === "undefined") return null;
    const rect = gw.getBoundingClientRect();
    const t = d3.zoomTransform(svg);
    return {
      x: rect.left + d.x * t.k + t.x,
      y: rect.top + d.y * t.k + t.y
    };
  }

  function panelRightWidth() {
    try {
      if (typeof plannerOpen !== "undefined" && plannerOpen) return 490;
      const panel = document.getElementById("panel");
      if (panel && panel.classList.contains("open")) return 390;
    } catch (e) { /* noop */ }
    return 0;
  }

  function dcloudJourneyForFamily(familyId, problems) {
    const pathId = (problems || []).map(p => p.dcloudPath).find(Boolean);
    if (!pathId) return null;
    try {
      const paths = typeof DCLOUD_PATHS !== "undefined" ? DCLOUD_PATHS : [];
      const path = paths.find(p => p.id === pathId);
      if (!path) return null;
      const entries = typeof dcloudPathEntries === "function" ? dcloudPathEntries(path) : [];
      const url = entries.length && typeof dcloudPrimaryUrl === "function" ? dcloudPrimaryUrl(entries[0]) : null;
      return url ? { title: path.title, url } : null;
    } catch (e) {
      return null;
    }
  }

  function opsFamilyFor(familyId, problems) {
    const ops = window.__cpnOps;
    if (!ops) return null;
    if (ops.hasOps(familyId)) return familyId;
    for (const p of problems || []) {
      const hit = (p.families || []).find(f => ops.hasOps(f));
      if (hit) return hit;
    }
    return null;
  }

  function learnJourneyFor(familyId) {
    try {
      if (typeof learningLinksFor !== "function") return null;
      const pack = learningLinksFor({ familyId, kind: "node" });
      const e = pack?.skills?.[0];
      if (!e?.url) return null;
      return { label: e.linkLabel || e.name || "Skill up", url: e.url };
    } catch (e) {
      return null;
    }
  }

  function journeySteps(familyId, primaryProb, problems) {
    const steps = [];
    if (primaryProb) {
      steps.push({ key: "explore", label: "Explore graph", kind: "btn", probId: primaryProb.id });
    }
    const dc = dcloudJourneyForFamily(familyId, problems);
    if (dc) {
      steps.push({ key: "dcloud", label: "Prove on dCloud", kind: "link", url: dc.url, hint: dc.title });
    }
    const opsFam = opsFamilyFor(familyId, problems);
    if (opsFam) {
      steps.push({ key: "canvas", label: "AI Canvas", kind: "btn", familyId: opsFam });
    }
    const learn = learnJourneyFor(familyId);
    if (learn) {
      steps.push({ key: "learn", label: "Skill up", kind: "link", url: learn.url, hint: learn.label });
    }
    return steps;
  }

  function renderJourneyHtml(steps) {
    if (!steps.length) return "";
    return `<div class="oc-journey">
      <div class="oc-journey-label">Journey</div>
      <div class="oc-journey-track">${steps.map((s, i) => {
        const arrow = i > 0 ? `<span class="oc-j-arrow" aria-hidden="true">→</span>` : "";
        if (s.kind === "link") {
          return `${arrow}<a class="oc-j-step" href="${escapeAttr(s.url)}" target="_blank" rel="noopener" title="${escapeAttr(s.hint || s.label)}">${escapeHtml(s.label)} ↗</a>`;
        }
        if (s.key === "explore") {
          return `${arrow}<button type="button" class="oc-j-step" data-ocj-explore="${escapeAttr(s.probId)}">${escapeHtml(s.label)}</button>`;
        }
        if (s.key === "canvas") {
          return `${arrow}<button type="button" class="oc-j-step oc-j-step--canvas" data-ocj-canvas="${escapeAttr(s.familyId)}">${escapeHtml(s.label)} →</button>`;
        }
        return "";
      }).join("")}</div>
    </div>`;
  }

  function escapeHtml(s) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(s);
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function problemBlockHtml(prob, persona, P) {
    const line = persona ? P.personaLine(prob, persona) : prob.outcome;
    const proof = prob.proof
      ? `<div class="oc-prob-proof"><span class="oc-prob-k">${escapeHtml(prob.proof.metric)}:</span> <span class="oc-prob-before">${escapeHtml(prob.proof.before)}</span> <span class="oc-prob-arrow">→</span> <span class="oc-prob-after">${escapeHtml(prob.proof.after)}</span></div>`
      : "";
    const next = prob.maturityNext ? P.getProblem(prob.maturityNext) : null;
    const chain = next
      ? `<button type="button" class="oc-prob-next" data-ocj-explore="${escapeAttr(next.id)}">Then: ${escapeHtml(next.outcome)} →</button>`
      : "";
    return `<div class="oc-prob-item">
      <div class="oc-prob-symptom">${escapeHtml(prob.symptom)}</div>
      <div class="oc-prob-outcome"><span class="oc-prob-tick">✓</span>${escapeHtml(line)}</div>
      ${proof}
      ${chain}
    </div>`;
  }

  function wireCard(card, familyId, primaryProb) {
    card.querySelector(".oc-close")?.addEventListener("click", () => hideOutcomeCard());
    card.querySelectorAll("[data-oc-persona]").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.ocPersona;
        const cur = typeof currentPersona === "function" ? currentPersona() : "";
        if (typeof setPersona === "function") setPersona(val === cur ? "" : val);
        showOutcomeCard(familyId, anchorNode);
      });
    });
    card.querySelector("[data-oc-more]")?.addEventListener("click", () => {
      expandedMore = true;
      showOutcomeCard(familyId, anchorNode);
    });
    card.querySelectorAll("[data-ocj-explore]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (typeof exploreProblem === "function") exploreProblem(btn.dataset.ocjExplore);
      });
    });
    card.querySelectorAll("[data-ocj-canvas]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (typeof openCloudControlBriefing === "function") openCloudControlBriefing(btn.dataset.ocjCanvas);
      });
    });
  }

  function showOutcomeCard(familyId, node) {
    const P = window.__cpnProblems;
    const card = cardEl();
    if (!P || !card) return;

    const problems = P.problemsForFamily(familyId);
    if (!problems.length) {
      hideOutcomeCard();
      return;
    }

    if (familyId !== activeFamilyId) expandedMore = false;
    activeFamilyId = familyId;
    anchorNode = node || (typeof nodeById !== "undefined" ? nodeById[familyId] : null);

    const persona = typeof currentPersona === "function" ? currentPersona() : "";
    const famName = P.nameOr(familyId);
    const primary = problems[0];
    const rest = problems.slice(1);
    const showRest = expandedMore && rest.length;

    const personaChips = P.PERSONAS.map(pp =>
      `<button type="button" class="oc-persona${pp.id === persona ? " on" : ""}" data-oc-persona="${escapeAttr(pp.id)}">${escapeHtml(pp.label)}</button>`
    ).join("");

    const moreBtn = rest.length && !expandedMore
      ? `<button type="button" class="oc-more" data-oc-more>+ ${rest.length} more problem${rest.length > 1 ? "s" : ""}</button>`
      : "";

    card.innerHTML = `
      <button type="button" class="oc-close" aria-label="Dismiss outcome card">×</button>
      <div class="oc-head">
        <div class="oc-family">${escapeHtml(famName)}</div>
        <div class="oc-title">Problems this solves</div>
      </div>
      <div class="oc-personas" role="group" aria-label="Frame for persona">${personaChips}</div>
      <div class="oc-problems">
        ${problemBlockHtml(primary, persona, P)}
        ${showRest ? rest.map(p => problemBlockHtml(p, persona, P)).join("") : ""}
        ${moreBtn}
      </div>
      ${renderJourneyHtml(journeySteps(familyId, primary, problems))}
      <div class="oc-note" title="${escapeAttr(P.DISCLAIMER)}">Directional talking points · not guarantees</div>`;

    wireCard(card, familyId, primary);
    card.style.display = "block";
    card.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => repositionOutcomeCard());
  }

  function hideOutcomeCard() {
    const card = cardEl();
    if (!card) return;
    card.style.display = "none";
    card.setAttribute("aria-hidden", "true");
    activeFamilyId = null;
    anchorNode = null;
    expandedMore = false;
  }

  function repositionOutcomeCard() {
    const card = cardEl();
    if (!card || card.style.display === "none" || !anchorNode) return;
    const pos = nodeScreenPosition(anchorNode);
    if (!pos) return;
    const cw = card.offsetWidth || 320;
    const ch = card.offsetHeight || 220;
    const panelW = panelRightWidth();
    const rightLimit = window.innerWidth - panelW - 12;
    let x = pos.x + 28;
    let y = pos.y - ch * 0.45;
    if (x + cw > rightLimit) x = pos.x - cw - 28;
    if (x < 12) x = 12;
    if (y < 72) y = 72;
    if (y + ch > window.innerHeight - 12) y = window.innerHeight - ch - 12;
    card.style.left = x + "px";
    card.style.top = y + "px";
  }

  window.__cpnOutcomeCard = {
    show: showOutcomeCard,
    hide: hideOutcomeCard,
    reposition: repositionOutcomeCard
  };
})();
