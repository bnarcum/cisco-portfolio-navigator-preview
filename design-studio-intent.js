/**
 * Design Studio — Deterministic intent engine (no AI).
 * Parses briefs → scores CVD/CVP/CT templates → generates cited design plans.
 */
(function DesignStudioIntentModule() {
  "use strict";

  const PILLARS = {
    "ai-dc": {
      label: "AI-Ready Data Centers",
      url: "https://www.cisco.com/c/en/us/solutions/data-center-virtualization/artificial-intelligence-machine-learning/index.html"
    },
    workplaces: {
      label: "Future-Proofed Workplaces",
      url: "https://www.cisco.com/c/en/us/solutions/collaboration/workplace-transformation/hybrid-work-design-guides.html"
    },
    resilience: {
      label: "Digital Resilience",
      url: "https://www.cisco.com/c/en/us/solutions/collateral/enterprise/design-zone-zero-trust.html"
    }
  };

  const DEFAULT_CVD = {
    label: "Cisco Validated Designs",
    url: "https://www.cisco.com/go/cvd"
  };

  const DEFAULT_CT = {
    label: "Cisco hybrid work design guides",
    url: "https://www.cisco.com/c/en/us/solutions/collaboration/workplace-transformation/hybrid-work-design-guides.html"
  };

  /** Per-template scoring: keywords (+pts), pillar boost */
  const NET_SCORE_RULES = {
    snraCampus: { kw: [/snra|secure network reference/i, /hybrid campus/i, /catalyst center/i, /future-?proofed/i, /c9300|c9500/i], pillar: "workplaces", pillarPts: 6 },
    campus3tierRedundant: { kw: [/3.?tier|redundant core/i, /\bhq\b|headquarters/i], pillar: "workplaces", pillarPts: 3 },
    campusCollapsed: { kw: [/collapsed core|small campus|500 user|smb/i], pillar: "workplaces", pillarPts: 4 },
    sdwanFull: { kw: [/sd-?wan|vmanage|multi-?site/i, /hq.*branch|8 branch|headquarter/i], pillar: "resilience", pillarPts: 5 },
    branchStandard: { kw: [/\bbranch\b/i, /remote office/i], pillar: "resilience", pillarPts: 3 },
    unifiedBranchMed: { kw: [/unified branch/i], pillar: "resilience", pillarPts: 6 },
    retailMeraki: { kw: [/retail|store|meraki/i], pillar: "workplaces", pillarPts: 4 },
    dcSpineLeaf: { kw: [/spine.?leaf|vxlan|nexus|data center|datacenter/i], pillar: "ai-dc", pillarPts: 5 },
    dcAciPod: { kw: [/aci pod|\baci\b/i], pillar: "ai-dc", pillarPts: 6 },
    dcAiMlFabric: { kw: [/ai\/?ml|gpu|inference|training cluster|llm/i], pillar: "ai-dc", pillarPts: 8 },
    k12District: { kw: [/k-?12|school|district/i], pillar: "workplaces", pillarPts: 5 },
    healthcareCampus: { kw: [/hospital|healthcare|clinical|medical/i], pillar: null, pillarPts: 0 },
    zeroTrustEdge: { kw: [/zero trust|sase|umbrella|duo/i], pillar: "resilience", pillarPts: 7 },
    hyperflexEdge: { kw: [/hyperflex|\bhx\b/i], pillar: "ai-dc", pillarPts: 4 },
    universityCampus: { kw: [/university|higher.?ed|college campus/i], pillar: "workplaces", pillarPts: 6 },
    manufacturingPlant: { kw: [/manufacturing|factory|plant|\bot\b|industrial/i], pillar: "resilience", pillarPts: 5 },
    sdAccessFabric: { kw: [/sd-?access|\bsda\b|fabric lan/i], pillar: "workplaces", pillarPts: 6 }
  };

  const PILLAR_DEFAULT_NET = {
    "ai-dc": "dcAiMlFabric",
    workplaces: "snraCampus",
    resilience: "zeroTrustEdge"
  };

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function isCiscoUrl(url) {
    if (!url || typeof url !== "string") return false;
    try {
      const h = new URL(url).hostname.toLowerCase();
      return h === "cisco.com" || h.endsWith(".cisco.com") || h === "webex.com" || h.endsWith(".webex.com");
    } catch { return false; }
  }

  function citeMeta(meta, fallback) {
    const label = meta?.cvd || meta?.ct || meta?.label || fallback?.label || "Reference";
    const url = meta?.cvdUrl || meta?.ctUrl || fallback?.url;
    if (!url || !isCiscoUrl(url)) return { label, url: fallback?.url || DEFAULT_CVD.url };
    return { label, url };
  }

  function detectPillar(t) {
    const scores = { "ai-dc": 0, workplaces: 0, resilience: 0 };
    if (/ai-?ready|gpu|nexus|spine|leaf|data center|datacenter|ucs|hyperflex|\baci\b|ml fabric|ndfc/i.test(t)) scores["ai-dc"] += 3;
    if (/webex|room kit|board pro|collab|hybrid|campus|wireless|catalyst center|workplace/i.test(t)) scores.workplaces += 3;
    if (/sd-?wan|zero trust|sase|firewall|ise|umbrella|resilien|thousandeyes|secure/i.test(t)) scores.resilience += 3;
    if (/future-?proofed workplace/i.test(t)) scores.workplaces += 5;
    if (/digital resilience/i.test(t)) scores.resilience += 5;
    if (/ai-?ready data center/i.test(t)) scores["ai-dc"] += 5;
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : null;
  }

  function parseNumbers(t, raw) {
    const branches = parseInt(t.match(/(\d+)\s*(branch|site|location)s?\b/i)?.[1] || "0", 10);
    const stores = parseInt(t.match(/(\d+)\s*(store|retail)s?\b/i)?.[1] || "0", 10);
    const users = parseInt(t.match(/(\d[\d,]*)\s*users?\b/i)?.[1]?.replace(/,/g, "") || "0", 10);
    const roomsTotal = parseRoomTotal(raw || t);
    return { branches, stores, users, roomsTotal };
  }

  function parseRoomTotal(raw) {
    const m = raw.match(/(\d+)\s+(?:webex\s+)?rooms?\b/i);
    if (m) return parseInt(m[1], 10);
    const m2 = raw.match(/(\d+)\s*(?:conference|huddle|boardroom|meeting)\s*rooms?\b/i);
    return m2 ? parseInt(m2[1], 10) : 0;
  }

  function mapRoomTypePhrase(phrase) {
    const p = phrase.toLowerCase();
    if (/auditorium|town\s*hall/.test(p)) return "auditorium";
    if (/focus(?:\s+room)?/.test(p)) return "focusRoom";
    if (/open\s+desk/.test(p)) return "openDesk";
    if (/huddle\s+byod|byod\s+huddle/.test(p)) return "huddleByod";
    if (/confidence\s+monitor|large\s+room\s+\+/.test(p)) return "largeRoomConfidence";
    if (/large\s+room/.test(p)) return "largeRoom";
    if (/small\s+room/.test(p)) return "smallRoom";
    if (/desk\s+essentials?/.test(p)) return "deskEssentials";
    if (/desk\s+voice|voice[\s-]optimized/.test(p)) return "deskVoice";
    if (/desk\s+hybrid|hybrid\s+desk/.test(p)) return "deskHybrid";
    if (/all[\s-]in[\s-]one\s+desk|desk\s+all[\s-]in[\s-]one/.test(p)) return "deskAllInOne";
    if (/boardroom/.test(p)) return "boardroom";
    if (/huddle/.test(p)) return "huddle";
    if (/training|classroom/.test(p)) return "training";
    if (/executive/.test(p)) return "executive";
    if (/teams/.test(p)) return "teamsRoom";
    if (/zoom/.test(p)) return "zoomRoom";
    if (/divisible|all-hands/.test(p)) return "divisible";
    if (/dual display/.test(p)) return "ctMediumDualDisplay";
    if (/small collab/.test(p)) return "ctSmallCollab";
    return "conference";
  }

  function inferMixFromBrief(raw, total) {
    const hasHuddle = /room bar|in huddles?|\bhuddles?\b/i.test(raw);
    const hasConf = /conference rooms?|room kit eq/i.test(raw);
    const hasBoard = /board pro/i.test(raw);
    const mix = [];

    if (hasHuddle && hasConf && total > 1) {
      const huddleCount = Math.max(1, Math.round(total * 0.33));
      const confTotal = total - huddleCount;
      if (hasBoard && /room kit/i.test(raw)) {
        const boardCount = Math.max(1, Math.round(confTotal * 0.4));
        mix.push({ key: "boardroom", count: boardCount });
        mix.push({ key: "conference", count: Math.max(1, confTotal - boardCount) });
      } else if (hasBoard) {
        mix.push({ key: "boardroom", count: confTotal });
      } else {
        mix.push({ key: "conference", count: confTotal });
      }
      mix.push({ key: "huddle", count: huddleCount });
      return mix;
    }
    if (hasBoard) return [{ key: "boardroom", count: total }];
    if (/room kit eq/i.test(raw)) return [{ key: "conference", count: total }];
    if (hasHuddle) return [{ key: "huddle", count: total }];
    if (hasConf) return [{ key: "conference", count: total }];
    return [];
  }

  function parseRoomMix(raw) {
    const t = raw.toLowerCase();
    const mix = [];
    const typeRe = /(\d+)\s*(auditoriums?|town\s*halls?|focus(?:\s+rooms?)?|open\s+desks?|large\s+rooms?|small\s+rooms?|boardrooms?|conferences?(?:\s+rooms?)?|huddles?|training(?:\s+rooms?)?|executive(?:\s+offices?)?|teams(?:\s+rooms?)?|zoom(?:\s+rooms?)?|desk\s+essentials?|desk\s+voice|desk\s+hybrid|all[\s-]in[\s-]one\s+desks?)/gi;
    let m;
    while ((m = typeRe.exec(raw)) !== null) {
      mix.push({ key: mapRoomTypePhrase(m[2]), count: Math.min(parseInt(m[1], 10), 24) });
    }
    if (mix.length) return mix;

    const total = parseRoomTotal(raw);
    if (total > 0) {
      const inferred = inferMixFromBrief(raw, total);
      if (inferred.length) {
        return inferred.map(x => ({ key: x.key, count: Math.min(x.count, 24) }));
      }
    }

    const hasCollab = /room|webex|collab|hybrid|meeting|video|kit/i.test(t);
    if (!hasCollab && total === 0) return [];

    let singleKey = "conference";
    if (/auditorium|town\s*hall/i.test(t)) singleKey = "auditorium";
    else if (/focus\s+room/i.test(t)) singleKey = "focusRoom";
    else if (/open\s+desk/i.test(t)) singleKey = "openDesk";
    else if (/huddle\s+byod|byod/i.test(t)) singleKey = "huddleByod";
    else if (/large\s+room/i.test(t)) singleKey = "largeRoom";
    else if (/small\s+room/i.test(t)) singleKey = "smallRoom";
    else if (/desk\s+essentials/i.test(t)) singleKey = "deskEssentials";
    else if (/desk\s+voice/i.test(t)) singleKey = "deskVoice";
    else if (/desk\s+hybrid/i.test(t)) singleKey = "deskHybrid";
    else if (/all[\s-]in[\s-]one\s+desk/i.test(t)) singleKey = "deskAllInOne";
    else if (/room bar|\bhuddle/i.test(t)) singleKey = "huddle";
    else if (/room kit eq/i.test(t)) singleKey = "conference";
    else if (/board pro|boardroom/i.test(t)) singleKey = "boardroom";
    const count = total || (hasCollab ? 1 : 0);
    if (count > 0) mix.push({ key: singleKey, count: Math.min(count, 24) });
    return mix;
  }

  function intentNeedsNetwork(t, roomMix, nums, pillar) {
    const totalRooms = roomMix.reduce((s, r) => s + r.count, 0);
    // A detected One Cisco pillar already implies an infrastructure intent —
    // never leave such a brief with an empty canvas.
    if (pillar) return true;
    return /campus|sd-wan|sdwan|hospital|healthcare|k-12|k12|data center|datacenter|branch|retail|zero trust|sase|firewall|core|distrib|nexus|spine|hyperflex|aci|meraki|vmanage|gpu|fabric|snra|manufacturing|university|office|headquarters|\bhq\b|wi-?fi|wireless|\bswitch(es)?\b|\blan\b|\bwan\b|\bnetwork\b|small business|\bsmb\b|enterprise|infrastructure/i.test(t)
      || nums.branches > 1 || nums.stores > 1 || totalRooms > 1
      || /ai-?ready data center|digital resilience|future-?proofed/i.test(t);
  }

  function parseIntent(text) {
    const raw = String(text || "").trim();
    const t = raw.toLowerCase();
    const pillar = detectPillar(t);
    const nums = parseNumbers(t, raw);
    const roomMix = parseRoomMix(raw);
    const signals = [];

    if (pillar) signals.push({ id: "pillar", label: PILLARS[pillar].label, value: pillar });
    if (nums.users) signals.push({ id: "users", label: "Users", value: String(nums.users) });
    if (nums.branches) signals.push({ id: "branches", label: "Branches", value: String(nums.branches) });
    if (nums.stores) signals.push({ id: "stores", label: "Stores", value: String(nums.stores) });
    roomMix.forEach(r => {
      const tpl = window.__DS_TEMPLATES?.ROOM_TEMPLATES?.[r.key];
      signals.push({ id: "room-" + r.key, label: tpl?.name || r.key, value: "×" + r.count });
    });

    return {
      raw, t, pillar, nums, roomMix,
      deviceOps: parseDeviceRequests(raw),
      wantsNetwork: intentNeedsNetwork(t, roomMix, nums, pillar),
      signals
    };
  }

  function scoreNetworkTemplates(parsed) {
    const nets = window.__DS_TEMPLATES?.NETWORK_TEMPLATES || {};
    const ranked = [];

    for (const [key, tpl] of Object.entries(nets)) {
      let score = 0;
      const reasons = [];
      const rules = NET_SCORE_RULES[key] || { kw: [], pillar: null, pillarPts: 0 };

      (tpl.tags || []).forEach(tag => {
        if (parsed.t.includes(tag.replace(/-/g, " ")) || parsed.t.includes(tag)) {
          score += 3;
          reasons.push(`tag:${tag}`);
        }
      });

      rules.kw.forEach(rx => {
        if (rx.test(parsed.raw)) {
          score += 5;
          reasons.push(`kw:${rx.source.slice(0, 24)}`);
        }
      });

      if (parsed.pillar && rules.pillar === parsed.pillar) {
        score += rules.pillarPts || 3;
        reasons.push(`pillar:${parsed.pillar}`);
      }

      if (parsed.nums.stores > 0 && key === "retailMeraki") { score += 8; reasons.push("retail-count"); }
      if (parsed.nums.branches >= 3 && (key === "sdwanFull" || key === "unifiedBranchMed")) { score += 6; reasons.push("multi-branch"); }

      ranked.push({ key, tpl, score, reasons });
    }

    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  function pickNetworkKey(parsed, ranked) {
    if (!parsed.wantsNetwork) return null;
    const top = ranked[0];
    if (top && top.score >= 5) return top.key;
    // Explicit venue / scale cues from plain-language briefs win over the
    // generic pillar default so the topology still reflects what was asked.
    if (/small business|small office|home office|\bsoho\b|\bsmb\b/i.test(parsed.t)) return "campusCollapsed";
    if (/retail|store|meraki/i.test(parsed.t)) return "retailMeraki";
    if (parsed.nums.branches > 0) return parsed.nums.branches >= 3 ? "sdwanFull" : "branchStandard";
    if (parsed.pillar && PILLAR_DEFAULT_NET[parsed.pillar]) return PILLAR_DEFAULT_NET[parsed.pillar];
    if (/office|headquarters|\bhq\b|campus|workplace|wi-?fi|wireless/i.test(parsed.t)) return "campus3tierRedundant";
    return "campusCollapsed";
  }

  function buildPlan(parsed) {
    const ranked = scoreNetworkTemplates(parsed);
    const netKey = pickNetworkKey(parsed, ranked);
    const nets = window.__DS_TEMPLATES?.NETWORK_TEMPLATES || {};
    const rooms = window.__DS_TEMPLATES?.ROOM_TEMPLATES || {};
    const citations = [];
    const choices = [];

    let netRank = ranked.find(r => r.key === netKey) || null;
    if (netKey && nets[netKey]) {
      const cite = citeMeta(nets[netKey], DEFAULT_CVD);
      citations.push({ type: "network", key: netKey, ...cite });
      choices.push({
        kind: "network",
        key: netKey,
        label: nets[netKey].label,
        score: netRank?.score || 0,
        reasons: netRank?.reasons || ["default-for-brief"],
        cite
      });
    }

    const roomPlan = [];
    parsed.roomMix.forEach(spec => {
      const tpl = rooms[spec.key];
      if (!tpl) return;
      const cite = citeMeta(tpl, DEFAULT_CT);
      citations.push({ type: "room", key: spec.key, ...cite });
      roomPlan.push({ key: spec.key, count: spec.count, tpl, cite });
      choices.push({
        kind: "room",
        key: spec.key,
        label: tpl.name,
        count: spec.count,
        cite
      });
    });

    if (parsed.pillar && PILLARS[parsed.pillar]) {
      citations.unshift({
        type: "pillar",
        key: parsed.pillar,
        label: PILLARS[parsed.pillar].label,
        url: PILLARS[parsed.pillar].url
      });
    }

    const clarifications = [];
    if (parsed.wantsNetwork && netRank && netRank.score < 5)
      clarifications.push("Network template chosen from One Cisco pillar default — add SNRA, SD-WAN, or vertical keywords for a tighter CVD match.");
    if (/room|webex|collab/i.test(parsed.t) && !roomPlan.length)
      clarifications.push("Collaboration detected but no room count — add e.g. “18 Webex rooms” or “12 conference and 6 huddle”.");
    const roomTotal = parsed.roomMix.reduce((s, r) => s + r.count, 0);
    if (parsed.nums.roomsTotal > 1 && roomTotal > 1 && !/(\d+)\s+conference|\d+\s+huddle/i.test(parsed.raw))
      clarifications.push(`Inferred ${roomPlan.map(r => `${r.count}× ${rooms[r.key]?.name || r.key}`).join(", ")} from ${parsed.nums.roomsTotal} Webex rooms — add explicit counts (e.g. “12 conference, 6 huddle”) to override.`);

    return {
      parsed, netKey, netRank, ranked: ranked.slice(0, 3),
      roomPlan, citations, choices, clarifications
    };
  }

  function cloneBranchSites(design, branchCount) {
    if (branchCount <= 1) return 0;
    const extra = Math.min(branchCount - 1, 6);
    const seeds = design.nodes.filter(n => n.canvas !== "room" && /branch/i.test(n.label));
    if (!seeds.length) return 0;
    const seedIds = new Set(seeds.map(n => n.id));
    const seedLinks = design.links.filter(l => seedIds.has(l.from) && seedIds.has(l.to));
    let added = 0;
    for (let b = 2; b <= extra + 1; b++) {
      const dx = (b - 1) * 220;
      const idMap = new Map();
      seeds.forEach(n => {
        const id = "ds-" + Math.random().toString(36).slice(2, 10);
        idMap.set(n.id, id);
        const label = n.label.replace(/Branch-(\d+)/, "Branch-" + b).replace(/^Branch ([A-Z])/, "Branch-" + b + " $1");
        design.nodes.push({ ...n, id, label, x: n.x + dx });
      });
      seedLinks.forEach(l => {
        design.links.push({
          ...l,
          id: "ds-" + Math.random().toString(36).slice(2, 10),
          from: idMap.get(l.from),
          to: idMap.get(l.to),
          label: (l.label || "Link") + " · site " + b
        });
      });
      added++;
    }
    return added;
  }

  const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

  function parseCount(token) {
    if (!token) return null;
    const t = token.toLowerCase();
    if (/^\d+$/.test(t)) return Math.min(parseInt(t, 10), 24);
    return NUM_WORDS[t] ?? null;
  }

  /**
   * Device-level BOM parsing (Layer C). Maps the brief's natural language onto
   * the canonical registry: explicit counts (mics), model variants (Board Pro
   * G2), control-device preference (Navigator vs Touch) and PoE-switch intent.
   * Conservative by design — only emits an op when the brief is explicit, so
   * generic briefs keep their template BOM untouched.
   */
  function parseDeviceRequests(raw) {
    const reg = window.__DS_STENCILS?.ROOM_DEVICES || {};
    const text = " " + String(raw || "").toLowerCase() + " ";
    const ops = { counts: {}, variants: {}, mentioned: [], controlPref: null, wantSwitch: false };
    for (const [sid, def] of Object.entries(reg)) {
      const aliases = def.aliases || [];
      for (const alias of aliases) {
        const idx = text.indexOf(alias);
        if (idx < 0) continue;
        if (!ops.mentioned.includes(sid)) ops.mentioned.push(sid);
        const before = text.slice(Math.max(0, idx - 16), idx);
        const m = before.match(/(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:cisco\s+)?$/);
        const c = m ? parseCount(m[1]) : null;
        if (c != null && def.role === "microphone") ops.counts[sid] = c;
        if (def.variants) {
          const win = before + " " + text.slice(idx, idx + alias.length + 18);
          for (const vk of Object.keys(def.variants)) {
            if (vk === "table") continue;
            if (new RegExp(`\\b${vk}\\b`, "i").test(win)) { ops.variants[sid] = vk; break; }
          }
        }
        break;
      }
    }
    const hasNav = ops.mentioned.includes("room-navigator") || /\bnavigator\b/.test(text);
    const hasTouch = ops.mentioned.includes("touch-10") || /\btouch\s?10\b|\btouch panel\b/.test(text);
    if (hasNav && !hasTouch) ops.controlPref = "room-navigator";
    else if (hasTouch && !hasNav) ops.controlPref = "touch-10";
    if (ops.mentioned.includes("c9200-collab") || /\bpoe switch\b|\bswitch\b/.test(text)) ops.wantSwitch = true;
    return ops;
  }

  function nextSwitchPort(links, switchId) {
    let max = 0;
    links.forEach(l => {
      if (l.from !== switchId) return;
      const m = (l.fromPort || "").match(/Gi1\/0\/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `Gi1/0/${max + 1}`;
  }

  function newId() { return "ds-" + Math.random().toString(36).slice(2, 10); }

  /** Reconcile the generated per-room BOM with the parsed device requests. */
  function applyDeviceOverrides(design, ops, deps) {
    if (!ops) return;
    const reg = deps.stencils?.ROOM_DEVICES || window.__DS_STENCILS?.ROOM_DEVICES || {};
    const isSwitch = sid => reg[sid]?.role === "collab-switch" || sid === "c9200-collab";

    (design.rooms || []).forEach(room => {
      const roomNodes = () => design.nodes.filter(n => n.roomId === room.id);

      // A) Model variants (e.g. Board Pro G2).
      Object.entries(ops.variants).forEach(([sid, vk]) => {
        const v = reg[sid]?.variants?.[vk];
        if (!v) return;
        roomNodes().filter(n => n.stencilId === sid).forEach(n => {
          n.variant = vk;
          if (v.pid) n.pid = v.pid;
          if (v.label) n.label = v.label;
        });
      });

      // B) Control-device preference (Navigator <-> Touch), ports are identical.
      if (ops.controlPref) {
        const target = ops.controlPref;
        const tdef = reg[target];
        roomNodes()
          .filter(n => n.stencilId === "touch-10" || n.stencilId === "room-navigator")
          .forEach(n => {
            if (n.stencilId === target) return;
            n.stencilId = target;
            n.pid = tdef?.pid;
            n.label = tdef?.label || n.label;
            if (tdef?.w) n.w = tdef.w;
            if (tdef?.h) n.h = tdef.h;
            delete n.variant;
          });
      }

      // C) Explicit device counts (microphones).
      Object.entries(ops.counts).forEach(([sid, want]) => {
        const def = reg[sid];
        if (!def) return;
        const cur = roomNodes().filter(n => n.stencilId === sid);
        if (want < cur.length) {
          const rmIds = new Set(cur.slice(want).map(n => n.id));
          design.nodes = design.nodes.filter(n => !rmIds.has(n.id));
          design.links = design.links.filter(l => !rmIds.has(l.from) && !rmIds.has(l.to));
        } else if (want > cur.length) {
          const template = cur[0];
          const srcLink = template ? design.links.find(l => l.to === template.id) : null;
          let srcId = srcLink?.from;
          if (!srcId) srcId = roomNodes().find(n => isSwitch(n.stencilId))?.id;
          const media = srcLink?.media || "cat6";
          const toPort = srcLink?.toPort || "ETH";
          for (let i = cur.length; i < want; i++) {
            const id = newId();
            design.nodes.push({
              id, stencilId: sid, label: `${def.label} ${i + 1}`, pid: def.pid,
              canvas: "room", roomId: room.id,
              x: (template?.x || 0) + (i - cur.length + 1) * 44, y: (template?.y || 0),
              w: def.w || 58, h: def.h || 42, qty: 1
            });
            if (srcId) design.links.push({
              id: newId(), from: srcId, to: id, media,
              label: `PoE-Mic${i + 1}`, length: "5m",
              fromPort: nextSwitchPort(design.links, srcId), toPort
            });
          }
        }
        const finalMics = roomNodes().filter(n => n.stencilId === sid);
        if (finalMics.length > 1) finalMics.forEach((n, idx) => { n.label = `${def.label} ${idx + 1}`; });
      });

      // D) Ensure a PoE switch is present when the brief asks for one.
      if (ops.wantSwitch && !roomNodes().some(n => isSwitch(n.stencilId))) {
        const def = reg["c9200-collab"];
        if (def) {
          const id = newId();
          const anchor = roomNodes().find(n => ["display", "codec"].includes(reg[n.stencilId]?.role));
          design.nodes.push({
            id, stencilId: "c9200-collab", label: def.label, pid: def.pid,
            canvas: "room", roomId: room.id,
            x: (anchor?.x || 0), y: (anchor?.y || 0) + 90, w: def.w || 96, h: def.h || 50, qty: 1
          });
          if (anchor) design.links.push({
            id: newId(), from: id, to: anchor.id, media: "cat6",
            label: "PoE", length: "5m", fromPort: "Gi1/0/1", toPort: "LAN"
          });
        }
      }
    });
  }

  function executePlan(plan, design, deps) {
    const { applyNetworkTemplate, applyRoomTemplate, ROOM_TEMPLATES } = deps.templates;
    const STN = deps.stencils;
    const uid = deps.uid;
    const ROOM_LAYOUT_OX = deps.ROOM_LAYOUT_OX ?? 40;
    const ROOM_LAYOUT_OY = deps.ROOM_LAYOUT_OY ?? 40;
    const autoLayoutRoom = deps.autoLayoutRoom;

    design.nodes = [];
    design.links = [];
    design.rooms = [];

    if (plan.netKey) {
      applyNetworkTemplate(design, plan.netKey, 80, 80, STN);
      const branches = plan.parsed.nums.branches;
      if (branches > 1) cloneBranchSites(design, branches);
    }

    plan.roomPlan.forEach(spec => {
      for (let i = 0; i < spec.count; i++) {
        const roomId = uid();
        const rtpl = ROOM_TEMPLATES[spec.key];
        const roomName = spec.count > 1 ? `${rtpl?.name || "Room"} ${i + 1}` : (rtpl?.name || "Room 1");
        design.rooms.push({
          id: roomId, name: roomName, template: spec.key,
          width: rtpl?.w || 480, height: rtpl?.h || 360
        });
        applyRoomTemplate(design, spec.key, roomId, roomName, ROOM_LAYOUT_OX, ROOM_LAYOUT_OY, design.nodes, design.links, STN);
        autoLayoutRoom(design, roomId);
      }
    });

    // Layer C: reconcile the template BOM with explicit device requests.
    applyDeviceOverrides(design, plan.parsed?.deviceOps, deps);

    if (design.rooms.length) {
      const priority = [
        "auditorium", "largeRoomConfidence", "largeRoom", "boardroom", "conference", "smallRoom",
        "training", "ctMediumDualDisplay", "ctSmallCollab", "huddle", "huddleByod", "focusRoom",
        "openDesk", "deskAllInOne", "deskHybrid", "deskVoice", "deskEssentials",
        "executive", "teamsRoom", "zoomRoom", "divisible"
      ];
      const pick = priority.map(k => design.rooms.find(r => r.template === k)).find(Boolean);
      design.activeRoomId = pick?.id || design.rooms[0].id;
    }
    design.requirements = design.requirements || {};
    design.requirements.notes = plan.parsed.raw.slice(0, 2000);
    design.intentPlan = {
      at: new Date().toISOString(),
      netKey: plan.netKey,
      roomPlan: plan.roomPlan.map(r => ({ key: r.key, count: r.count })),
      pillar: plan.parsed.pillar,
      citations: plan.citations
    };
    return design;
  }

  function autoRemediate(design, rules, uid, STN, maxRounds = 3) {
    const applied = [];
    if (!rules?.validateDesign || !rules?.getSuggestions || !rules?.applyFix) return applied;

    for (let round = 0; round < maxRounds; round++) {
      const val = rules.validateDesign(design);
      const errors = (val.warnings || []).filter(w => w.severity === "error");
      if (!errors.length) break;

      const suggestions = rules.getSuggestions(design) || [];
      const fix = suggestions.find(s => /codec|PoE|orphan|Uplink|switch/i.test(s.label));
      if (!fix) break;
      if (rules.applyFix(design, fix, uid, STN)) applied.push(fix.label);
    }
    return applied;
  }

  function renderChipsHtml(signals) {
    if (!signals?.length) return '<div class="ds-intent-chips ds-intent-chips--empty"><span class="ds-intent-chip-hint">Parsed signals appear as you type</span></div>';
    return `<div class="ds-intent-chips" aria-live="polite">${signals.map(s =>
      `<span class="ds-intent-chip" data-signal="${escapeHtml(s.id)}"><strong>${escapeHtml(s.label)}</strong> ${escapeHtml(s.value)}</span>`
    ).join("")}</div>`;
  }

  function renderRationaleHtml(plan, score, fixes) {
    const lines = [];
    if (plan.parsed.pillar && PILLARS[plan.parsed.pillar]) {
      const p = PILLARS[plan.parsed.pillar];
      lines.push(`<li><span class="ds-rat-kind">Pillar</span> <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.label)}</a></li>`);
    }
    plan.choices.forEach(c => {
      const cite = c.cite;
      const extra = c.count ? ` <em>×${c.count}</em>` : (c.score ? ` <span class="ds-rat-score">fit ${c.score}</span>` : "");
      lines.push(`<li><span class="ds-rat-kind">${c.kind === "network" ? "CVD" : "Room"}</span> <strong>${escapeHtml(c.label)}</strong>${extra} — <a href="${escapeHtml(cite.url)}" target="_blank" rel="noopener">${escapeHtml(cite.label)}</a></li>`);
    });
    const roomTotal = plan.roomPlan.reduce((s, r) => s + r.count, 0);
    if (roomTotal > 1)
      lines.push(`<li class="ds-rat-tip">📐 <strong>${roomTotal} collaboration spaces</strong> in your portfolio — use the room picker above the canvas to walk each floor plan. Devices match Cisco Tested hybrid-work guides.</li>`);
    if (plan.clarifications.length)
      plan.clarifications.forEach(c => lines.push(`<li class="ds-rat-tip">💡 ${escapeHtml(c)}</li>`));
    if (fixes?.length)
      fixes.forEach(f => lines.push(`<li class="ds-rat-fix">✓ Auto-fix: ${escapeHtml(f)}</li>`));

    return `<section class="ds-intent-rationale" aria-labelledby="ds-rat-title">
      <h3 id="ds-rat-title">Design rationale <span class="ds-rat-score-badge">Score ${score}/100</span></h3>
      <p class="ds-rat-lede">Every topology choice maps to a Cisco or Webex validated reference — no fabricated products.</p>
      <ul class="ds-rat-list">${lines.join("")}</ul>
    </section>`;
  }

  function generateFromIntent(text, design, deps, options) {
    const parsed = parseIntent(text);
    if (options?.roomMix?.length) parsed.roomMix = options.roomMix;
    const plan = buildPlan(parsed);
    executePlan(plan, design, deps);
    const fixes = autoRemediate(design, deps.rules, deps.uid, deps.stencils);
    const score = deps.rules?.computeScore?.(design) ?? 0;
    return { plan, score, fixes };
  }

  window.__DS_INTENT = {
    PILLARS, parseIntent, buildPlan, executePlan, generateFromIntent,
    autoRemediate, renderChipsHtml, renderRationaleHtml, scoreNetworkTemplates,
    isCiscoUrl, citeMeta, parseDeviceRequests, applyDeviceOverrides
  };
})();
