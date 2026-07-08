#!/usr/bin/env node
/** Build SVG symbol defs from official Cisco brand icons → assets/cisco-symbols.js */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const iconsDir = path.join(root, "assets/cisco-brand-icons");

/** Maps graph icon keys (iconKey / productIconKey) → file under assets/cisco-brand-icons */
const ICON_MAP = {
  switch: "icon_switch.svg",
  wifi: "icon_wi-fi_6.svg",
  router: "icon_router.svg",
  globe: "icon_sd-wan.svg",
  chip: "icon_silicon_1.svg",
  gear: "icon_settings.svg",
  intersight: "icon_intersight_platform_overview.svg",
  fabric: "icon_nexus_aci.svg",
  factory: "icon_industrial_asset_vision.svg",
  shield: "icon_firewall.svg",
  "shield-bolt": "icon_zero_trust.svg",
  lock: "icon_cisco_and_secure_connect.svg",
  key: "icon_identity_services_engine.svg",
  email: "icon_internet_mail_services.svg",
  endpoint: "icon_endpoints.svg",
  eye: "icon_visibility.svg",
  radar: "icon_visibility.svg",
  "real-time": "icon_world.svg",
  insights: "icon_insights.svg",
  "shield-network": "icon_network_security.svg",
  cube: "icon_containers_and_cloud_native.svg",
  flow: "icon_network_insights.svg",
  "globe-lock": "icon_multicloud_security.svg",
  cloud: "icon_cloud.svg",
  bug: "icon_security_threat.svg",
  wrench: "icon_implementation.svg",
  fingerprint: "icon_user_identity_access.svg",
  chat: "icon_hybrid_work.svg",
  social: "icon_customer_journey_platform.svg",
  agent: "icon_services.svg",
  telepresence: "icon_telepresence.svg",
  webinar: "icon_webinar.svg",
  video: "icon_telepresence.svg",
  monitor: "icon_telepresence.svg",
  phone: "icon_phone.svg",
  "cloud-calling": "icon_cloud_calling.svg",
  deskphone: "icon_desk_phone.svg",
  confphone: "icon_conference.svg",
  "conf-speaker": "icon_conference.svg",
  headset: "icon_headset.svg",
  server: "icon_server_unified_computing_system_ucs.svg",
  hyperflex: "icon_hyperflex_data_center.svg",
  "chart-line": "icon_data_platform.svg",
  "chart-bars": "icon_data_driven_insights.svg",
  dashboard: "icon_cloud_operations.svg",
  camera: "icon_camera.svg",
  board: "icon_personal_room.svg",
  codec: "icon_telepresence.svg",
  videobar: "icon_telepresence.svg",
  touch: "icon_tablet.svg",
  product: "icon_software.svg",
  thousandeyes: "icon_thousandeyes.svg",
  "cx-platform": "icon_customer_journey_platform.svg",
};

const ART_LAYER_IDS = ["art", "Layer_2", "Outlines_"];
const JUNK_GROUP_IDS = new Set([
  "export_frame",
  "border",
  "_x38__grid",
  "guide_shapes",
  "Layer_1",
]);

function resolveIconPath(rel) {
  const direct = path.join(iconsDir, rel);
  if (fs.existsSync(direct)) return direct;
  const base = path.join(iconsDir, path.basename(rel));
  if (fs.existsSync(base)) return base;
  throw new Error(`Missing Cisco icon file: ${rel}`);
}

function stripSvgWrapper(raw) {
  return raw
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg[\s\S]*?>/i, "")
    .replace(/<\/svg>\s*$/i, "");
}

function parseHiddenClasses(styleText) {
  const hidden = new Set();
  for (const m of styleText.matchAll(/\.([\w-]+)\s*\{[^}]*display\s*:\s*none[^}]*\}/gi)) {
    hidden.add(m[1]);
  }
  return hidden;
}

function findOpeningGTag(inner, id) {
  const re = new RegExp(`<g\\s[^>]*\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`, "i");
  const m = re.exec(inner);
  if (!m) return null;
  return { start: m.index, openEnd: m.index + m[0].length };
}

function extractBalancedGroup(inner, id) {
  const hit = findOpeningGTag(inner, id);
  if (!hit) return null;
  let depth = 1;
  let i = hit.openEnd;
  while (i < inner.length && depth > 0) {
    const nextOpen = inner.indexOf("<g", i);
    const nextClose = inner.indexOf("</g>", i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 2;
    } else {
      depth -= 1;
      i = nextClose + 4;
    }
  }
  const block = inner.slice(hit.start, i);
  return block.replace(/^<g[^>]*>/i, "").replace(/<\/g>\s*$/i, "");
}

function removeBalancedGroup(inner, id) {
  const hit = findOpeningGTag(inner, id);
  if (!hit) return inner;
  let depth = 1;
  let i = hit.openEnd;
  while (i < inner.length && depth > 0) {
    const nextOpen = inner.indexOf("<g", i);
    const nextClose = inner.indexOf("</g>", i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 2;
    } else {
      depth -= 1;
      i = nextClose + 4;
    }
  }
  return inner.slice(0, hit.start) + inner.slice(i);
}

function groupHasHiddenClass(openTag, hiddenClasses) {
  const cls = openTag.match(/\sclass="([^"]*)"/i)?.[1] || "";
  return [...hiddenClasses].some(c => new RegExp(`\\b${c}\\b`).test(cls));
}

function removeHiddenClassGroups(inner, hiddenClasses) {
  if (!hiddenClasses.size) return inner;
  let out = inner;
  let changed = true;
  while (changed) {
    changed = false;
    const re = /<g\b[^>]*>/gi;
    let m;
    while ((m = re.exec(out)) !== null) {
      if (!groupHasHiddenClass(m[0], hiddenClasses)) continue;
      const start = m.index;
      let depth = 1;
      let i = m.index + m[0].length;
      while (i < out.length && depth > 0) {
        const nextOpen = out.indexOf("<g", i);
        const nextClose = out.indexOf("</g>", i);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth += 1;
          i = nextOpen + 2;
        } else {
          depth -= 1;
          i = nextClose + 4;
        }
      }
      out = out.slice(0, start) + out.slice(i);
      changed = true;
      break;
    }
  }
  return out;
}

function pickArtLayer(inner) {
  for (const id of ART_LAYER_IDS) {
    const art = extractBalancedGroup(inner, id);
    if (art && art.trim()) return art;
  }
  const partial = inner.match(/<g\s[^>]*\bid="[^"]*(?:art|Outlines)[^"]*"[^>]*>/i);
  if (partial) {
    const id = partial[0].match(/\bid="([^"]+)"/i)?.[1];
    if (id) {
      const art = extractBalancedGroup(inner, id);
      if (art && art.trim()) return art;
    }
  }
  return null;
}

function removeJunkGroups(inner) {
  let out = inner;
  for (const id of JUNK_GROUP_IDS) {
    while (findOpeningGTag(out, id)) out = removeBalancedGroup(out, id);
  }
  return out;
}

function applyCurrentColor(out) {
  return out
    .replace(/\sid="[^"]*"/gi, "")
    .replace(/\sclass="[^"]*"/gi, "")
    .replace(/\sfill="[^"]*"/gi, "")
    .replace(/\sstroke="[^"]*"/gi, "")
    .replace(/\sstyle="[^"]*"/gi, "")
    .replace(/<path(?![^>]*fill=)/gi, '<path fill="currentColor"')
    .replace(/<circle(?![^>]*fill=)/gi, '<circle fill="currentColor"')
    .replace(/<rect(?![^>]*fill=)/gi, '<rect fill="currentColor"')
    .replace(/<polygon(?![^>]*fill=)/gi, '<polygon fill="currentColor"')
    .replace(/<ellipse(?![^>]*fill=)/gi, '<ellipse fill="currentColor"')
    .replace(/<polyline(?![^>]*fill=)/gi, '<polyline fill="currentColor"')
    .replace(/<line(?![^>]*stroke=)/gi, '<line stroke="currentColor" stroke-width="1.5"');
}

function normalizeInnerSvg(raw) {
  const styleText = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(m => m[1]).join("\n");
  const hiddenClasses = parseHiddenClasses(styleText);

  let inner = stripSvgWrapper(raw).replace(/<style[\s\S]*?<\/style>/gi, "");

  const art = pickArtLayer(inner);
  if (art) inner = art;
  else inner = removeJunkGroups(inner);

  inner = removeHiddenClassGroups(inner, hiddenClasses);
  inner = removeJunkGroups(inner);

  return applyCurrentColor(inner).trim();
}

function countVisibleElements(inner) {
  return (inner.match(/<(path|circle|rect|polygon|ellipse|polyline|line)\b/gi) || []).length;
}

function svgToSymbol(key, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const viewBox = raw.match(/viewBox=["']([^"']+)["']/i)?.[1] || "0 0 80 80";
  const inner = normalizeInnerSvg(raw);
  const count = countVisibleElements(inner);
  if (count === 0) {
    throw new Error(`Icon "${key}" (${path.basename(filePath)}) produced no visible SVG elements after normalization`);
  }
  return `<symbol id="icon-${key}" viewBox="${viewBox}">${inner}</symbol>`;
}

const symbols = [];
for (const [key, rel] of Object.entries(ICON_MAP)) {
  symbols.push(svgToSymbol(key, resolveIconPath(rel)));
}

const js = `/* Generated by scripts/build-cisco-icons.mjs — do not edit */\nwindow.CPN_CISCO_SYMBOLS = \`\n${symbols.join("\n")}\n\`;\n`;
fs.writeFileSync(path.join(root, "assets/cisco-symbols.js"), js);
console.log(`Built ${symbols.length} Cisco icon symbols → assets/cisco-symbols.js`);
