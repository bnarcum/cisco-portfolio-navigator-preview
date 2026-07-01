/**
 * Design Studio — progressive disclosure: CVD/CT docs + dCloud labs
 */
(function () {
  "use strict";

  const PILLAR_CTX = {
    "ai-dc": {
      pathId: "ai-networking",
      useCases: ["AI Networking", "Data Center Modernization"],
      dcloudIds: ["cisco-ai-ready-data-center", "cisco-secure-ai-factory-with-nvidia"],
      query: "AI data center"
    },
    workplaces: {
      pathId: "hybrid-work",
      useCases: ["Hybrid Work"],
      dcloudIds: [
        "future-proof-workplaces-one-cisco-collab-ecosystem",
        "room-systems-collab-ecosystem",
        "webex-suite-hybrid-collaboration"
      ],
      query: "hybrid work webex room"
    },
    resilience: {
      pathId: "zero-trust",
      useCases: ["Zero Trust Security"],
      dcloudIds: ["one-cisco-secure-networking", "cisco-xdr-breach-protection-suite-v1-instant-demo"],
      query: "zero trust SNRA"
    }
  };

  const NET_CTX = {
    snraCampus: { pathId: "hybrid-work", useCases: ["Hybrid Work", "Zero Trust Security"], query: "SNRA secure campus" },
    dcAiMlFabric: { pathId: "ai-networking", useCases: ["AI Networking"], query: "AI spine leaf" },
    sdwanFull: { pathId: "sdwan-sase", useCases: ["SD-WAN / SASE"], query: "SD-WAN" },
    campus3tierRedundant: { useCases: ["Network Automation", "Hybrid Work"], query: "campus catalyst" },
    campusCollapsed: { useCases: ["Network Automation"], query: "campus LAN" },
    healthcareCampus: { useCases: ["Hybrid Work"], query: "healthcare campus" },
    unifiedBranchMed: { pathId: "sdwan-sase", useCases: ["SD-WAN / SASE"], query: "unified branch" },
    merakiCampus: { useCases: ["Network Automation"], query: "Meraki campus" },
    eduK12: { useCases: ["Hybrid Work"], query: "education campus" }
  };

  const ROOM_CTX = {
    conference: { useCases: ["Hybrid Work"], dcloudIds: ["room-systems-collab-ecosystem"], query: "conference room webex" },
    boardroom: { useCases: ["Hybrid Work"], dcloudIds: ["room-systems-collab-ecosystem"], query: "boardroom video" },
    huddle: { useCases: ["Hybrid Work"], dcloudIds: ["room-systems-collab-ecosystem"], query: "huddle room bar" },
    training: { useCases: ["Hybrid Work"], dcloudIds: ["room-systems-collab-ecosystem"], query: "training room" },
    executive: { useCases: ["Hybrid Work"], dcloudIds: ["webex-suite-hybrid-collaboration"], query: "executive briefing" },
    teamsRoom: { useCases: ["Hybrid Work"], dcloudIds: ["room-systems-collab-ecosystem"], query: "Microsoft Teams room" },
    zoomRoom: { useCases: ["Hybrid Work"], dcloudIds: ["room-systems-collab-ecosystem"], query: "Zoom room" },
    ctMediumDualDisplay: { useCases: ["Hybrid Work"], dcloudIds: ["room-systems-collab-ecosystem"], query: "dual display boardroom" },
    ctSmallCollab: { useCases: ["Hybrid Work"], dcloudIds: ["room-systems-collab-ecosystem"], query: "small collaboration" },
    divisible: { useCases: ["Hybrid Work"], dcloudIds: ["room-systems-collab-ecosystem"], query: "divisible room" }
  };

  function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function pathById(pathId) {
    const paths = window.DCLOUD_PATHS || [];
    return paths.find(p => p.id === pathId) || null;
  }

  function entryById(id) {
    return (window.DCLOUD_ENTRIES || []).find(e => e.id === id);
  }

  function rankSkills(ctx, limit = 2) {
    if (typeof window.learningRankEntries !== "function") return [];
    return window.learningRankEntries({
      familyIds: ctx.familyIds || [],
      sources: ctx.skillSources || ["cisco-u", "webex-academy"],
      limit,
      requireProductOrFamily: false
    });
  }

  function dcloudProgressHtml(labs) {
    if (!labs?.length || typeof localStorage === "undefined") return "";
    let done = 0;
    labs.forEach(l => { try { if (localStorage.getItem(`cpn-dcloud-done-${l.id}`)) done++; } catch (e) { /* ignore */ } });
    if (!done) return "";
    return `<span class="ds-explore-progress">${done}/${labs.length} labs marked complete</span>`;
  }

  function rankLabs(ctx, limit = 3) {
    if (typeof window.dcloudRankEntries === "function") {
      const ranked = window.dcloudRankEntries({
        useCases: ctx.useCases || [],
        familyIds: ctx.familyIds || [],
        limit: limit + 2,
        requireProductOrFamily: false
      });
      const ids = ctx.dcloudIds || [];
      const pinned = ids.map(entryById).filter(Boolean);
      const seen = new Set();
      const out = [];
      [...pinned, ...ranked].forEach(e => {
        if (!e || seen.has(e.id)) return;
        seen.add(e.id);
        out.push(e);
      });
      return out.slice(0, limit);
    }
    const entries = window.DCLOUD_ENTRIES || [];
    const ids = new Set(ctx.dcloudIds || []);
    const scored = entries.map(e => {
      let score = ids.has(e.id) ? 100 : 0;
      if (ctx.pathId && e.pathId === ctx.pathId) score += 40;
      if ((ctx.useCases || []).some(u => e.useCases?.includes(u))) score += 25;
      if (e.primary) score += 8;
      return score > 0 ? { e, score } : null;
    }).filter(Boolean);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(x => x.e);
  }

  function docsFromCitations(plan) {
    if (!plan?.citations?.length) return [];
    const seen = new Set();
    return plan.citations.map(c => ({ label: c.label || c.type, url: c.url }))
      .filter(d => d.url && !seen.has(d.url) && seen.add(d.url));
  }

  function docFromNetTpl(key) {
    const t = window.__DS_TEMPLATES?.NETWORK_TEMPLATES?.[key];
    if (!t?.cvdUrl) return [];
    return [{ label: t.cvd || "Cisco Validated Design", url: t.cvdUrl }];
  }

  function docFromRoomTpl(key) {
    const t = window.__DS_TEMPLATES?.ROOM_TEMPLATES?.[key];
    if (!t?.ctUrl) return [];
    return [{ label: t.ct || "Cisco Tested room guide", url: t.ctUrl }];
  }

  function resolveContextForChamber(ch, studio) {
    if (!ch || !studio) return null;
    const part = ch.campusPart || (ch.canvas === "room" ? "room" : "network");
    if (part === "room") {
      const node = studio.design?.nodes?.find(n => n.id === ch.id);
      const roomId = node?.roomId || studio.activeRoomId || studio.design?.rooms?.[0]?.id;
      const room = studio.design?.rooms?.find(r => r.id === roomId);
      const tplKey = room?.template;
      const ctx = ROOM_CTX[tplKey] || { useCases: ["Hybrid Work"] };
      return {
        docs: docFromRoomTpl(tplKey),
        labs: rankLabs(ctx, 2),
        skills: rankSkills(ctx, 1),
        pathId: ctx.pathId || "hybrid-work",
        browseQuery: ctx.query || room?.name || "hybrid work room"
      };
    }
    const sid = (ch.stencilId || ch.label || "").toLowerCase();
    const plan = studio.design?.intentPlan;
    const netKey = plan?.netKey;
    let ctx = { ...(NET_CTX[netKey] || { useCases: ["Hybrid Work", "Network Automation"] }) };
    if (/9200|9300|collab|switch/i.test(sid)) ctx.query = ctx.query || "catalyst campus switch poe";
    else if (/9500|core|n9k/i.test(sid)) ctx.query = ctx.query || "campus core switching";
    else if (/9179|mr57|wireless|ap\b/i.test(sid)) ctx.query = ctx.query || "wireless access point";
    else if (/fpr|firewall/i.test(sid)) ctx.query = ctx.query || "firewall secure networking";
    else if (/ise/i.test(sid)) ctx.query = ctx.query || "cisco ise 802.1x";
    else ctx.query = ctx.query || ch.label || "campus network";
    const netTpl = netKey ? window.__DS_TEMPLATES?.NETWORK_TEMPLATES?.[netKey] : null;
    return {
      docs: docsFromCitations(plan).length ? docsFromCitations(plan) : docFromNetTpl(netKey),
      labs: rankLabs(ctx, 2),
      skills: rankSkills(ctx, 1),
      pathId: ctx.pathId,
      browseQuery: ctx.query || netTpl?.label || ch.label
    };
  }

  function renderDcloudWalkActions(ctx) {
    const labs = ctx?.labs || [];
    if (!labs.length) return "";
    const primary = labs[0];
    const url = labUrl(primary);
    const browse = ctx.browseQuery || "";
    return `<div class="ds-walk-dcloud">
      <span class="ds-walk-dcloud-label">dCloud</span>
      <a class="ds-walk-dcloud-launch" href="${esc(url)}" target="_blank" rel="noopener" data-dcloud-id="${esc(primary.id)}">${esc(primary.linkLabel || primary.name)} ↗</a>
      <button type="button" class="ds-walk-dcloud-browse" data-browse-query="${esc(browse)}">Browse labs</button>
    </div>`;
  }

  function renderDcloudFieldSection(ctx) {
    const labs = ctx?.labs || [];
    if (!labs.length) return "";
    const primary = labs[0];
    const url = labUrl(primary);
    const browse = ctx.browseQuery || "";
    const more = labs.slice(1, 3).map(e =>
      `<a class="ds-fp-dcloud-alt" href="${esc(labUrl(e))}" target="_blank" rel="noopener" data-dcloud-id="${esc(e.id)}">${esc(e.linkLabel || e.name)} ↗</a>`
    ).join("");
    return `<section class="ds-fp-section ds-fp-dcloud">
      <h4>Try on dCloud</h4>
      <p class="ds-fp-dcloud-lead">Hands-on lab matched to this device from your design context.</p>
      <div class="ds-fp-dcloud-actions">
        <a class="ds-walk-btn primary ds-fp-dcloud-primary" href="${esc(url)}" target="_blank" rel="noopener" data-dcloud-id="${esc(primary.id)}">Launch ${esc(primary.linkLabel || primary.name)} ↗</a>
        <button type="button" class="ds-walk-btn ds-fp-dcloud-browse" data-browse-query="${esc(browse)}">Browse all labs…</button>
      </div>
      ${more ? `<div class="ds-fp-dcloud-more">${more}</div>` : ""}
    </section>`;
  }

  function wireDcloudRoot(root) {
    if (!root) return;
    wireRoot(root);
  }

  function resolveContext(studio) {
    const design = studio.design || {};
    const plan = design.intentPlan;
    const tab = studio.tab;

    if (tab === "room" && studio.activeRoomId) {
      const room = design.rooms.find(r => r.id === studio.activeRoomId);
      const tplKey = room?.template;
      const ctx = ROOM_CTX[tplKey] || { useCases: ["Hybrid Work"] };
      return {
        eyebrow: "Want to know more?",
        lede: "Your diagram is a starting point — validate the room design and try the devices on dCloud.",
        docs: docFromRoomTpl(tplKey),
        labs: rankLabs(ctx, 2),
        skills: rankSkills(ctx, 2),
        pathId: ctx.pathId || "hybrid-work",
        browseQuery: ctx.query || room?.name || "hybrid work room"
      };
    }

    if (tab === "network") {
      const netKey = plan?.netKey;
      const ctx = NET_CTX[netKey] || { useCases: ["Hybrid Work", "Network Automation"] };
      const netTpl = netKey ? window.__DS_TEMPLATES?.NETWORK_TEMPLATES?.[netKey] : null;
      return {
        eyebrow: "Want to go deeper?",
        lede: "Read the validated design guide, then launch a hands-on lab matched to this topology.",
        docs: docsFromCitations(plan).length ? docsFromCitations(plan) : docFromNetTpl(netKey),
        labs: rankLabs(ctx, 2),
        skills: rankSkills(ctx, 2),
        pathId: ctx.pathId,
        browseQuery: ctx.query || netTpl?.label || "campus network"
      };
    }

    const text = document.getElementById("ds-intent-text")?.value || "";
    const parsed = window.__DS_INTENT?.parseIntent?.(text);
    const pillar = studio.lastPillarId || parsed?.pillar || plan?.parsed?.pillar || plan?.pillar;
    const pillarCtx = PILLAR_CTX[pillar] || PILLAR_CTX.workplaces;
    const netCtx = plan?.netKey ? NET_CTX[plan.netKey] : null;
    const merged = {
      pathId: pillarCtx.pathId || netCtx?.pathId,
      useCases: [...new Set([...(pillarCtx.useCases || []), ...(netCtx?.useCases || [])])],
      dcloudIds: [...new Set([...(pillarCtx.dcloudIds || []), ...(netCtx?.dcloudIds || [])])],
      query: pillarCtx.query || netCtx?.query || "cisco validated design"
    };

    let docs = docsFromCitations(plan);
    if (!docs.length && plan?.netKey) docs = docFromNetTpl(plan.netKey);
    if (!docs.length && plan?.roomPlan?.length) {
      const firstRoom = plan.roomPlan[0]?.key;
      if (firstRoom) docs = docFromRoomTpl(firstRoom);
    }

    return {
      eyebrow: "See the vision — dive as deep as you want",
      lede: "Generate your draft here, then explore Cisco validated guides and dCloud labs for the same story.",
      docs,
      labs: rankLabs(merged, 3),
      skills: rankSkills(merged, 2),
      pathId: merged.pathId,
      browseQuery: merged.query
    };
  }

  function labUrl(e) {
    if (typeof window.dcloudPrimaryUrl === "function") return window.dcloudPrimaryUrl(e);
    return e.instantUrl || e.catalogUrl || "";
  }

  function renderPathStrip(pathId) {
    const path = pathById(pathId);
    if (!path) return "";
    const steps = (path.steps || []).slice(0, 4).map(id => entryById(id)).filter(Boolean);
    if (!steps.length) {
      return `<div class="ds-explore-path">
        <span class="ds-explore-path-label">dCloud path</span>
        <strong>${esc(path.title)}</strong>
        <span class="ds-explore-path-tag">${esc(path.tagline || "")}</span>
      </div>`;
    }
    return `<div class="ds-explore-path">
      <span class="ds-explore-path-label">dCloud learning path</span>
      <strong>${esc(path.title)}</strong>
      <ol class="ds-explore-path-steps">${steps.map((s, i) =>
        `<li><span>${i + 1}</span> ${esc(s.linkLabel || s.name)}</li>`
      ).join("")}</ol>
    </div>`;
  }

  function stripHasCards(ctx, compact) {
    if (!ctx) return false;
    const docs = (ctx.docs || []).slice(0, compact ? 1 : undefined);
    const labs = (ctx.labs || []).slice(0, compact ? 1 : undefined);
    const skills = (ctx.skills || []).slice(0, compact ? 1 : undefined);
    return docs.length + labs.length + skills.length > 0;
  }

  function renderStrip(ctx, compact) {
    if (!ctx) return "";
    const docs = (ctx.docs || []).slice(0, compact ? 1 : undefined);
    const labs = (ctx.labs || []).slice(0, compact ? 1 : undefined);
    const skills = (ctx.skills || []).slice(0, compact ? 1 : undefined);
    if (!stripHasCards(ctx, compact)) {
      return "";
    }
    const docCards = docs.map(d =>
      `<a class="ds-explore-card ds-explore-card--doc" href="${esc(d.url)}" target="_blank" rel="noopener">
        <span class="ds-explore-badge">Validated guide</span>
        <strong>${esc(d.label)}</strong>
        <span class="ds-explore-cta">Read on cisco.com ↗</span>
      </a>`
    ).join("");
    const labCards = labs.map(e =>
      `<div class="ds-explore-card ds-explore-card--dcloud">
        <span class="ds-explore-badge ds-explore-badge--dcloud">dCloud lab</span>
        <strong>${esc(e.linkLabel || e.name)}</strong>
        ${e.duration ? `<span class="ds-explore-meta">${esc(e.duration)}${e.level ? " · " + esc(e.level) : ""}</span>` : ""}
        ${e.hint ? `<p class="ds-explore-hint">${esc(e.hint)}</p>` : ""}
        <div class="ds-explore-actions">
          <a class="ds-explore-btn ds-explore-btn--launch" href="${esc(labUrl(e))}" target="_blank" rel="noopener" data-dcloud-id="${esc(e.id)}">Launch lab ↗</a>
          ${e.catalogUrl && e.catalogUrl !== labUrl(e)
        ? `<a class="ds-explore-btn ds-explore-btn--ghost" href="${esc(e.catalogUrl)}" target="_blank" rel="noopener">Catalog ↗</a>` : ""}
        </div>
      </div>`
    ).join("");
    const skillCards = skills.map(s =>
      `<a class="ds-explore-card ds-explore-card--skill" href="${esc(s.url)}" target="_blank" rel="noopener">
        <span class="ds-explore-badge ds-explore-badge--skill">Skills</span>
        <strong>${esc(s.linkLabel || s.name || s.title)}</strong>
        ${s.duration ? `<span class="ds-explore-meta">${esc(s.duration)}</span>` : ""}
        <span class="ds-explore-cta">Open learning ↗</span>
      </a>`
    ).join("");
  return `<section class="ds-explore" aria-label="Learn more">
      ${compact
    ? `<header class="ds-explore-head ds-explore-head--compact"><span class="ds-explore-eyebrow">${esc(ctx.eyebrow || "Learn")}</span></header>`
    : `<header class="ds-explore-head">
        <span class="ds-explore-eyebrow">${esc(ctx.eyebrow || "Want to know more?")}</span>
        <p>${esc(ctx.lede || "")}</p>
      </header>`}
      ${!compact && ctx.pathId ? renderPathStrip(ctx.pathId) : ""}
      ${compact ? "" : `<div class="ds-explore-ladder"><span>CVD</span><span>→</span><span>Skills</span><span>→</span><span>dCloud</span><span>→</span><span>BOM</span></div>`}
      <div class="ds-explore-grid">${docCards}${skillCards}${labCards}</div>
      ${compact ? "" : `<footer class="ds-explore-foot">
        <button type="button" class="ds-explore-browse" data-browse-query="${esc(ctx.browseQuery || "")}">Browse all matching dCloud labs</button>
        ${dcloudProgressHtml(labs)}
        <span class="ds-explore-note">RTP datacenter · Cisco.com login required</span>
      </footer>`}
    </section>`;
  }

  function cardFooter(gtab, key) {
    const ctx = gtab === "room"
      ? { ...ROOM_CTX[key], ...docFromRoomTpl(key).length ? {} : {}, docs: docFromRoomTpl(key), labs: rankLabs(ROOM_CTX[key] || { useCases: ["Hybrid Work"] }, 1), browseQuery: (ROOM_CTX[key] || {}).query }
      : (() => {
        const nc = NET_CTX[key] || { useCases: ["Network Automation"] };
        const t = window.__DS_TEMPLATES?.NETWORK_TEMPLATES?.[key];
        return { ...nc, docs: docFromNetTpl(key), labs: rankLabs(nc, 1), browseQuery: nc.query || t?.label };
      })();
    const doc = (ctx.docs || [])[0];
    const lab = (ctx.labs || [])[0];
    if (!doc && !lab) return "";
    return `<div class="ds-gallery-explore">
      ${doc ? `<a class="ds-gallery-explore-link" href="${esc(doc.url)}" target="_blank" rel="noopener" data-stop-card>Guide ↗</a>` : ""}
      ${lab ? `<a class="ds-gallery-explore-link ds-gallery-explore-link--dcloud" href="${esc(labUrl(lab))}" target="_blank" rel="noopener" data-stop-card data-dcloud-id="${esc(lab.id)}">Try on dCloud ↗</a>` : ""}
      <button type="button" class="ds-gallery-explore-more" data-browse-query="${esc(ctx.browseQuery || "")}" data-stop-card>More labs…</button>
    </div>`;
  }

  function wireRoot(root) {
    if (!root) return;
    root.querySelectorAll("[data-dcloud-id]").forEach(a => {
      a.addEventListener("click", () => {
        const id = a.getAttribute("data-dcloud-id");
        if (id && typeof window.dcloudMarkLabDone === "function") window.dcloudMarkLabDone(id, true);
      });
    });
    root.querySelectorAll("[data-browse-query]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        const q = btn.getAttribute("data-browse-query") || "";
        if (typeof window.openDcloudBrowser === "function") window.openDcloudBrowser({ query: q });
      });
    });
    root.querySelectorAll("[data-stop-card]").forEach(el => {
      el.addEventListener("click", e => e.stopPropagation());
    });
  }

  function refresh(studio) {
    if (!studio?.el) return;
    const ctx = resolveContext(studio);
    const html = renderStrip(ctx, studio.tab === "intent" || studio.sidebarMode !== "learn");
    const intentEl = document.getElementById("ds-explore-intent");
    const dockEl = document.getElementById("ds-explore-dock");
    const foldEl = document.getElementById("ds-explore-fold");
    if (intentEl) {
      intentEl.innerHTML = studio.tab === "intent" ? html : "";
      wireRoot(intentEl);
    }
    if (dockEl) {
      dockEl.innerHTML = studio.tab !== "intent" ? html : "";
      const empty = !html;
      if (foldEl) foldEl.hidden = studio.tab === "intent" || empty;
      wireRoot(dockEl);
    }
  }

  window.__DS_EXPLORE = {
    refresh, cardFooter, resolveContext, rankLabs,
    resolveContextForChamber, renderDcloudWalkActions, renderDcloudFieldSection, wireDcloudRoot
  };
})();
