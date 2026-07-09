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
must(/style\.features\.quest/.test(walk), "Cable Quest must be gated by style features");
must(/style\.features\.avatar/.test(walk), "avatar must be gated by style features");
must(/if \(style\.features\.avatar\) state\.thirdPerson = true;/.test(walk), "Lab avatar mode must restore third-person avatar visibility");

must(/function addExecutiveWorld/.test(walk), "professional executive world is missing");
must(!/ds-walk-presentation/.test(css), "Presentation CSS should be removed");
must(/ds-walk-explore/.test(css), "Explore CSS class is missing");
must(/ds-walk-lab/.test(css), "Lab CSS class is missing");
must(/#ds-walk-overlay\.ds-walk-lab/.test(css), "Lab mode style must keep the playful skin");

must(/Generate sample walkthrough/.test(studio), "Quickstart copy should say walkthrough, not 3D walk");
must(/id="ds-walk-corridor"[\s\S]*>Present</.test(studio), "Toolbar should use Present label");
must(/Open guided solution walkthrough/.test(studio), "Toolbar title should describe guided walkthrough");

if (errors.length) {
  console.error("FAIL test-design-studio-walk-modes");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("OK test-design-studio-walk-modes");
