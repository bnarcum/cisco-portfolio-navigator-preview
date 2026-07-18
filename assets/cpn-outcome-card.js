/**
 * Node-attached outcome card — "Problems this solves" on the graph canvas.
 * One primary problem (+ expand) and persona framing.
 *
 * In Composition / Families views, opening the card reserves right chrome and
 * animates the graph left; closing animates back.
 */
(function () {
  "use strict";

  const CARD_GAP = 16;
  const CARD_FALLBACK_W = 360;

  let activeFamilyId = null;
  let expandedMore = false;
  let anchorNode = null;
  let graphWasPushed = false;

  function cardEl() {
    return document.getElementById("outcome-card");
  }

  function isVisible() {
    const card = cardEl();
    return !!(card && card.style.display !== "none" && card.getAttribute("aria-hidden") !== "true");
  }

  function offsetW() {
    if (!isVisible()) return 0;
    const card = cardEl();
    const w = card?.offsetWidth || CARD_FALLBACK_W;
    return w + CARD_GAP;
  }

  function viewMode() {
    try {
      if (typeof window.viewMode === "string") return window.viewMode;
    } catch (e) { /* noop */ }
    const active = document.querySelector("[data-vm].active");
    return active?.dataset?.vm || "";
  }

  function shouldPushGraph() {
    const vm = viewMode();
    return vm === "composition" || vm === "families";
  }

  function refitGraph(animate) {
    if (!shouldPushGraph()) return;
    if (typeof window.refitGraphForChrome === "function") {
      window.refitGraphForChrome(animate);
    }
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

  function escapeHtml(s) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(s);
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function problemBlockHtml(prob, persona, P, opts) {
    const view = P.personaView ? P.personaView(prob, persona) : { symptom: prob.symptom, line: persona ? P.personaLine(prob, persona) : prob.outcome, proof: prob.proof };
    const symptom = view.symptom || prob.symptom;
    const line = view.line || prob.outcome;
    const proof = view.proof || prob.proof;
    const compare = proof
      ? `<div class="oc-compare">
          <div class="oc-compare-box oc-compare-before">
            <div class="oc-compare-lbl">Before</div>${escapeHtml(proof.before)}
          </div>
          <div class="oc-compare-arrow" aria-hidden="true">→</div>
          <div class="oc-compare-box oc-compare-after">
            <div class="oc-compare-lbl">After</div>${escapeHtml(proof.after)}
          </div>
        </div>`
      : "";
    const next = prob.maturityNext ? P.getProblem(prob.maturityNext) : null;
    const chain = next
      ? `<button type="button" class="oc-prob-next" data-ocj-explore="${escapeAttr(next.id)}">Then explore <b>${escapeHtml(next.outcome)}</b> →</button>`
      : "";
    const divider = opts?.withDivider ? `<div class="oc-prob-divider" role="separator"></div>` : "";
    return `${divider}
      <p class="oc-quote">"<em>${escapeHtml(symptom)}</em>"</p>
      <div class="oc-headline">${escapeHtml(line)}</div>
      ${compare}
      ${chain}`;
  }

  function personaMetaLabel(persona, P) {
    if (!persona) return "Problems this solves";
    const p = P.PERSONAS.find(x => x.id === persona);
    return `Problems this solves · ${p?.label || persona} view`;
  }

  function wireCard(card, familyId, primaryProb) {
    card.querySelector(".oc-close")?.addEventListener("click", () => hideOutcomeCard());
    card.querySelectorAll("[data-oc-persona]").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.ocPersona;
        const cur = typeof currentPersona === "function" ? currentPersona() : "";
        if (typeof setPersona === "function") setPersona(val === cur ? "" : val);
        if (typeof restoreGraphNodeIcons === "function") restoreGraphNodeIcons();
        showOutcomeCard(familyId, anchorNode, { skipGraphPush: true });
      });
    });
    card.querySelector("[data-oc-more]")?.addEventListener("click", () => {
      expandedMore = true;
      showOutcomeCard(familyId, anchorNode, { skipGraphPush: true });
    });
    card.querySelectorAll("[data-ocj-explore]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (typeof exploreProblem === "function") exploreProblem(btn.dataset.ocjExplore);
        if (typeof restoreGraphNodeIcons === "function") restoreGraphNodeIcons();
      });
    });
  }

  function showOutcomeCard(familyId, node, opts) {
    const P = window.__cpnProblems;
    const card = cardEl();
    if (!P || !card) return;

    const problems = P.problemsForFamily(familyId);
    if (!problems.length) {
      hideOutcomeCard();
      return;
    }

    const wasVisible = isVisible();
    const pushGraph = shouldPushGraph() && !opts?.skipGraphPush;

    if (familyId !== activeFamilyId) expandedMore = false;
    activeFamilyId = familyId;
    anchorNode = node || (typeof nodeById !== "undefined" ? nodeById[familyId] : null);

    const persona = typeof currentPersona === "function" ? currentPersona() : "";
    const famName = P.nameOr(familyId);
    const primary = problems[0];
    const rest = problems.slice(1);
    const showRest = expandedMore && rest.length;

    const personaChips = P.PERSONAS.map(pp =>
      `<button type="button" role="tab" aria-selected="${pp.id === persona ? "true" : "false"}" class="oc-persona${pp.id === persona ? " on" : ""}" data-oc-persona="${escapeAttr(pp.id)}">${escapeHtml(pp.label)}</button>`
    ).join("");

    const moreBtn = rest.length && !expandedMore
      ? `<button type="button" class="oc-more" data-oc-more>+ ${rest.length} more problem${rest.length > 1 ? "s" : ""}</button>`
      : "";

    card.innerHTML = `
      <button type="button" class="oc-close" aria-label="Dismiss outcome card">×</button>
      <div class="oc-head">
        <div class="oc-title">${escapeHtml(famName)}</div>
        <div class="oc-meta">${escapeHtml(personaMetaLabel(persona, P))}</div>
      </div>
      <div class="oc-persona-block">
        <div class="oc-persona-label">View as</div>
        <div class="oc-personas" role="tablist" aria-label="Frame outcome for persona">${personaChips}</div>
      </div>
      <div class="oc-problems">
        ${problemBlockHtml(primary, persona, P)}
        ${showRest ? rest.map((p, i) => problemBlockHtml(p, persona, P, { withDivider: true })).join("") : ""}
        ${moreBtn}
      </div>
      <div class="oc-note" title="${escapeAttr(P.DISCLAIMER)}">Directional talking points · not guarantees</div>`;

    wireCard(card, familyId, primary);
    card.style.display = "block";
    card.setAttribute("aria-hidden", "false");
    card.classList.toggle("oc-dock", shouldPushGraph());

    if (pushGraph && (!wasVisible || !graphWasPushed)) {
      graphWasPushed = true;
      refitGraph(true);
    }

    requestAnimationFrame(() => {
      repositionOutcomeCard();
      if (pushGraph && !wasVisible) {
        requestAnimationFrame(() => repositionOutcomeCard());
      }
    });
  }

  function hideOutcomeCard() {
    const card = cardEl();
    if (!card) return;
    const hadPush = graphWasPushed && shouldPushGraph();
    card.style.display = "none";
    card.setAttribute("aria-hidden", "true");
    card.classList.remove("oc-dock");
    activeFamilyId = null;
    anchorNode = null;
    expandedMore = false;
    graphWasPushed = false;
    if (hadPush) refitGraph(true);
  }

  function repositionOutcomeCard() {
    const card = cardEl();
    if (!card || card.style.display === "none" || !anchorNode) return;
    const pos = nodeScreenPosition(anchorNode);
    if (!pos) return;

    const cw = card.offsetWidth || CARD_FALLBACK_W;
    const ch = card.offsetHeight || 220;
    const panelW = panelRightWidth();
    const edgePad = 12;

    let x;
    let y = pos.y - ch * 0.45;

    if (shouldPushGraph()) {
      const rightLimit = window.innerWidth - panelW - edgePad;
      x = rightLimit - cw;
    } else {
      const rightLimit = window.innerWidth - panelW - edgePad;
      x = pos.x + 28;
      if (x + cw > rightLimit) x = pos.x - cw - 28;
    }

    if (x < edgePad) x = edgePad;
    if (y < 72) y = 72;
    if (y + ch > window.innerHeight - edgePad) y = window.innerHeight - ch - edgePad;

    card.style.left = x + "px";
    card.style.top = y + "px";
  }

  window.addEventListener("resize", () => {
    if (!isVisible()) return;
    repositionOutcomeCard();
  });

  window.__cpnOutcomeCard = {
    show: showOutcomeCard,
    hide: hideOutcomeCard,
    reposition: repositionOutcomeCard,
    offsetW,
    isVisible
  };
})();
