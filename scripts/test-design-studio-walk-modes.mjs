#!/usr/bin/env node
/** Design Studio walk modes: professional default + optional explorer/lab. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const walk = fs.readFileSync(path.join(root, "design-studio-walk.js"), "utf8");
const css = fs.readFileSync(path.join(root, "design-studio.css"), "utf8");
const studio = fs.readFileSync(path.join(root, "design-studio.js"), "utf8");

const errors = [];
const must = (ok, msg) => { if (!ok) errors.push(msg); };

must(/const WALK_STYLE_KEY\s*=\s*"cpn-ds-walk-style"/.test(walk), "walk style preference key is missing");
must(/const WALK_STYLES\s*=/.test(walk), "walk style registry is missing");
must(!/presentation:\s*\{[\s\S]*label:\s*"Presentation"/.test(walk), "Presentation mode should be removed");
must(/explore:\s*\{[\s\S]*label:\s*"Explore"/.test(walk), "Explore mode definition is missing");
must(/lab:\s*\{[\s\S]*label:\s*"Lab"/.test(walk), "Lab mode definition is missing");
must(/function currentWalkStyle/.test(walk), "currentWalkStyle resolver is missing");
must(/currentWalkStyle\(\)[\s\S]*return "lab"/.test(walk), "Lab must be the default fallback");
must(/setupDiagramWorld\(THREE, scene, bounds, graph, currentWalkStyle\(\)\)/.test(walk), "world setup must receive the active walk style");
must(/setupAvatar\(THREE, scene, currentWalkStyle\(\)\)/.test(walk), "avatar setup must receive the active walk style");
must(/data-action="walk-style"/.test(walk), "walk style HUD buttons are missing");
must(/style\.features\.manualMove/.test(walk), "manual movement must be gated by style features");
must(/\.features\.quest/.test(walk), "Cable Quest must be gated by style features");
must(/style\.features\.avatar/.test(walk), "avatar must be gated by style features");
must(/if \(style\.features\.avatar\) state\.thirdPerson = true;/.test(walk), "Avatar walk styles must restore third-person visibility");
must(/explore:[\s\S]*pointerLock:\s*true/.test(walk), "Explore must use pointer-lock navigation like Lab");
must(/explore:[\s\S]*avatar:\s*true/.test(walk), "Explore must show the walk avatar like Lab");

must(/function addExecutiveWorld/.test(walk), "professional executive world is missing");
must(!/ds-walk-presentation/.test(css), "Presentation CSS should be removed");
must(/ds-walk-explore/.test(css), "Explore CSS class is missing");
must(/ds-walk-lab/.test(css), "Lab CSS class is missing");
must(/function usesGlassHud/.test(walk), "Glass HUD helper is missing");
must(/return hudHtmlGlass/.test(walk), "Walk HUD must use glass layout for Lab and Explore");
must(/#ds-walk-overlay \.ds-walk-hud-glass[\s\S]*left:10px/.test(css), "Glass HUD must anchor top-left");
must(/#ds-walk-overlay \.ds-walk-hud-glass[\s\S]*width:min\(400px/.test(css), "Glass HUD must use compact width");
must(!/hud-more-toggle/.test(walk), "Walk HUD overflow menu should be removed");
must(/ds-walk-hud-row2[\s\S]*data-action="packets"[\s\S]*data-action="packet-speed"/.test(walk), "Packets and speed belong in main HUD row");

must(/id="ds-walk-corridor"[\s\S]*>Present</.test(studio), "Toolbar should use Present label");
must(/Open guided solution walkthrough/.test(studio), "Toolbar title should describe guided walkthrough");
must(/function shouldRenderWalk/.test(walk), "walk render gate is missing");
must(/visibilitychange/.test(walk), "walk must pause WebGL when the tab is hidden");
must(/window\.__DS_WALK\?\.close/.test(studio), "closing Design Studio must stop Walk mode");

if (errors.length) {
  console.error("FAIL test-design-studio-walk-modes");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("OK test-design-studio-walk-modes");
