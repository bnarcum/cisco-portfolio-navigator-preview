/**
 * Design Studio — diagram layout → 3D world coordinates (single source of truth)
 */
(function () {
  "use strict";

  const NET_SCALE = 0.052;
  const ROOM_SCALE = 0.048;
  const NET_LAYER_Z = { wan: -16, security: -11, core: -5, distribution: 1, dc: 3, access: 9, mgmt: 5, collab: 13 };
  const NET_LAYER_ORDER = ["wan", "security", "core", "distribution", "dc", "access", "mgmt", "collab"];

  function deviceKind(stencilId, label, zone) {
    const id = `${stencilId || ""} ${label || ""}`.toLowerCase();
    const z = (zone || "").toLowerCase();
    if (/^display-|display-\d|primary display|confidence|people display|content display|main display|front display|room-bar|bar pro/.test(id)) return "display";
    if (/quad|camera|\bcam\b/.test(id)) return "camera";
    if (/touch|teams panel|zoom controller/.test(id)) return "touch";
    if (z === "ceiling" && /mic/.test(id)) return "ceiling-mic";
    if (/table-mic/.test(id) || (/mic/.test(id) && z === "table")) return "table-mic";
    if (/9179|mr57|9120|9166|cw91|meraki.*ap|\bap\b/.test(id)) return "ap";
    if (/internet|mpls|dia|users|vlan|cloud|logical/.test(id)) return "logical";
    if (/fpr|firewall|ftd/.test(id)) return "firewall";
    if (/kit|codec|eq|board pro/.test(id)) return "codec";
    if (/9200|9300|9400|9500|switch|n9k|nexus|apic|ucs/.test(id)) return "switch";
    return "default";
  }

  function placementWhy(kind, zone, layer, mode) {
    const room = {
      display: "Wall-mounted at the front of the room — primary video surface for participants.",
      camera: "Mounted on the front wall above or beside the display, aimed at the conference table.",
      touch: "On the conference table within arm's reach — in-room control for calls and sharing.",
      "ceiling-mic": "Ceiling-mounted for even audio pickup across the table zone.",
      "table-mic": "On the table surface — close talker pickup for the codec.",
      codec: "In the credenza or rack — terminates AV and control on the LAN.",
      switch: "Collaboration PoE switch in the equipment nook — powers endpoints.",
      default: "Positioned per the room template zone for install-ready layouts."
    };
    const net = {
      ap: "Ceiling-mounted wireless access point — PoE from the access switch below.",
      logical: "Logical handoff at the WAN demarc — represents circuits and cloud edges.",
      firewall: "Security rack bay — inspects traffic between zones.",
      switch: `In the ${layer || "network"} rack row — ${NET_LAYER_ORDER.includes(layer) ? "aligned with your diagram layer" : "as designed"}.`,
      default: `Placed in the ${layer || "network"} layer aisle for a walkable closet layout.`
    };
    return (mode === "room" ? room : net)[kind] || (mode === "room" ? room.default : net.default);
  }

  function buildRoomFrame(chambers, nodes) {
    const zs = chambers.map(c => c.pos?.z).filter(Number.isFinite);
    const xs = chambers.map(c => c.pos?.x).filter(Number.isFinite);
    const display = chambers.filter(c => c.zone === "display" || deviceKind(c.stencilId, c.label, c.zone) === "display");
    const table = chambers.filter(c => c.zone === "table" || /table-mic|conf-table/i.test(c.stencilId || ""));
    const frontZ = display.length ? Math.min(...display.map(c => c.pos.z)) : (zs.length ? Math.min(...zs) : 0);
    const tableCx = table.length ? table.reduce((s, c) => s + c.pos.x, 0) / table.length : (xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0);
    const tableCz = table.length ? table.reduce((s, c) => s + c.pos.z, 0) / table.length : frontZ + 4;
    const tableSpread = table.length > 1 ? Math.max(3, Math.max(...table.map(c => c.pos.x)) - Math.min(...table.map(c => c.pos.x)) + 2) : 5.5;
    const tableDepth = table.length > 1 ? Math.max(2, Math.max(...table.map(c => c.pos.z)) - Math.min(...table.map(c => c.pos.z)) + 1.5) : 2.4;
    const credenzaZ = Math.max(...zs, frontZ + 6);
    return { frontZ, tableCx, tableCz, tableSpread, tableDepth, credenzaZ, hasDisplay: display.length > 0 };
  }

  function buildNetworkFrame(chambers) {
    const isDc = chambers.some(c => /n9k|spine|leaf|apic|ucs|aci/i.test(`${c.stencilId} ${c.label}`));
    const demarcZ = NET_LAYER_Z.wan;
    return { isDc, demarcZ, layerZ: { ...NET_LAYER_Z } };
  }

  function inferZoneForKind(kind, zones) {
    const pref = {
      display: "display", camera: "display", touch: "table",
      "ceiling-mic": "ceiling", "table-mic": "table",
      codec: "rack", switch: "rack", ap: "ceiling"
    };
    const name = pref[kind];
    if (name && zones[name]) return name;
    return Object.keys(zones)[0] || "default";
  }

  function nearestZone(zones, ox, oy, cx, cy) {
    let best = Object.keys(zones)[0] || "default";
    let bestD = Infinity;
    Object.entries(zones).forEach(([name, z]) => {
      const zx = ox + z.x + z.w / 2;
      const zy = oy + z.y + z.h / 2;
      const d = Math.hypot(cx - zx, cy - zy);
      if (d < bestD) { bestD = d; best = name; }
    });
    return best;
  }

  function relPosInZone(z, ox, oy, cx, cy) {
    const padX = 16;
    const padY = 24;
    const innerW = Math.max(z.w - padX * 2, 48);
    const innerH = Math.max(z.h - padY * 2, 48);
    const relX = Math.max(0.06, Math.min(0.94, (cx - (ox + z.x + padX)) / innerW));
    const relY = Math.max(0.06, Math.min(0.94, (cy - (oy + z.y + padY)) / innerH));
    return { relX, relY };
  }

  /** Hybrid placement: template match, else zone + relative position from Room diagram. */
  function resolveRoomPlacement(nodes, room, tplItems) {
    const tpl = window.__DS_TEMPLATES?.ROOM_TEMPLATES?.[room?.template];
    const zones = room?.computedZones || tpl?.zones;
    const ox = room?.layoutOrigin?.x ?? 100;
    const oy = room?.layoutOrigin?.y ?? 132;
    const claimed = new Set();
    const out = {};
    if (!nodes?.length) return out;

    nodes.forEach(n => {
      let item = tplItems?.find(it => it.label === n.label);
      if (!item) item = tplItems?.find(it => it.stencilId === n.stencilId && !claimed.has(it.label));
      if (item) {
        claimed.add(item.label);
        out[n.id] = { zone: item.zone, relX: item.relX ?? 0.5, relY: item.relY ?? 0.5, fromTemplate: true };
        return;
      }
      const c = nodeCenter(n);
      const kind = deviceKind(n.stencilId, n.label, null);
      let zoneName = zones ? inferZoneForKind(kind, zones) : "default";
      if (zones && !zones[zoneName]) zoneName = nearestZone(zones, ox, oy, c.x, c.y);
      const z = zones?.[zoneName];
      const rel = z ? relPosInZone(z, ox, oy, c.x, c.y) : { relX: 0.5, relY: 0.5 };
      out[n.id] = { zone: zoneName, relX: rel.relX, relY: rel.relY, kind };
    });
    return out;
  }

  function clampToRoomFrame(chambers, frame) {
    if (!frame || !chambers?.length) return;
    const margin = 1.4;
    const halfW = Math.max(frame.tableSpread * 0.55, 4.5) + margin;
    const minX = frame.tableCx - halfW;
    const maxX = frame.tableCx + halfW;
    const minZ = frame.frontZ - margin;
    const maxZ = frame.credenzaZ + margin;
    chambers.forEach(ch => {
      if (!ch.pos || !Number.isFinite(ch.pos.x)) return;
      ch.pos.x = Math.max(minX, Math.min(maxX, ch.pos.x));
      ch.pos.z = Math.max(minZ, Math.min(maxZ, ch.pos.z));
    });
  }

  function applyRoomSemantics(chambers, nodes, items, placementById) {
    if (!chambers?.length) return buildRoomFrame(chambers, nodes);
    const frame = buildRoomFrame(chambers, nodes);
    const itemFor = ch => {
      const placed = placementById?.[ch.id];
      if (placed) return placed;
      return items?.find(it => it.label === ch.label) || items?.find(it => it.stencilId === ch.stencilId);
    };
    chambers.forEach(ch => {
      const kind = deviceKind(ch.stencilId, ch.label, ch.zone);
      const item = itemFor(ch);
      if (item?.zone) ch.zone = item.zone;
      const rx = item?.relX ?? ch.relX ?? 0.5;
      const ry = item?.relY ?? ch.relY ?? 0.5;
      ch.relX = rx;
      ch.relY = ry;
      ch.semantic = { kind, mode: "room", why: placementWhy(kind, ch.zone, null, "room") };
      ch.anchored = true;

      if (kind === "display") {
        ch.zone = "display";
        ch.pos.z = frame.frontZ + 0.12;
        ch.pos.y = 2.05;
        ch.pos.x = frame.tableCx + (rx - 0.5) * Math.max(frame.tableSpread, 4);
        ch.faceYaw = 0;
      } else if (kind === "camera") {
        ch.zone = "display";
        ch.pos.z = frame.frontZ + 0.18;
        ch.pos.y = 2.65;
        ch.pos.x = frame.tableCx + (rx - 0.5) * 3;
        ch.faceYaw = 0;
      } else if (kind === "touch") {
        ch.zone = "table";
        ch.pos.x = frame.tableCx + (rx - 0.5) * frame.tableSpread;
        ch.pos.z = frame.tableCz + (ry - 0.5) * frame.tableDepth;
        ch.pos.y = 0.82;
      } else if (kind === "ceiling-mic" || kind === "ap") {
        ch.zone = kind === "ap" ? "ceiling" : "ceiling";
        ch.pos.y = 2.85;
        ch.pos.x = frame.tableCx + (rx - 0.5) * frame.tableSpread;
        ch.pos.z = frame.tableCz + (ry - 0.5) * Math.max(frame.tableDepth, 2.4);
      } else if (kind === "table-mic") {
        ch.zone = "table";
        ch.pos.x = frame.tableCx + (rx - 0.5) * frame.tableSpread;
        ch.pos.z = frame.tableCz + (ry - 0.5) * frame.tableDepth;
        ch.pos.y = 0.86;
      } else if (kind === "codec" || (kind === "switch" && ch.zone === "rack")) {
        ch.zone = "rack";
        ch.pos.z = Math.max(ch.pos.z, frame.credenzaZ - 1);
        ch.pos.y = 1.05;
        ch.pos.x = frame.tableCx + (rx - 0.5) * 4;
      } else if (ch.zone === "table" && /conf-table/.test(ch.stencilId || "")) {
        ch.pos.x = frame.tableCx;
        ch.pos.z = frame.tableCz;
        ch.pos.y = 0.4;
        ch.anchored = false;
      } else {
        ch.pos.x = frame.tableCx + (rx - 0.5) * frame.tableSpread;
        ch.pos.z = frame.frontZ + 2 + ry * Math.max(frame.tableDepth, 2.4);
        ch.pos.y = ch.zone === "ceiling" ? 2.85 : (ch.zone === "rack" ? 1.05 : 0.9);
      }
    });
    constrainedRelax(chambers, "room");
    clampToRoomFrame(chambers, frame);
    return frame;
  }

  function applyNetworkSemantics(chambers, nodes) {
    if (!chambers?.length) return buildNetworkFrame(chambers);
    const frame = buildNetworkFrame(chambers);
    const byLayer = {};
    chambers.forEach(ch => {
      const node = nodes.find(n => n.id === ch.id);
      const layer = ch.zone || node?.layer || "access";
      ch.zone = layer;
      (byLayer[layer] ||= []).push(ch);
    });
    NET_LAYER_ORDER.forEach(layer => {
      const list = byLayer[layer] || [];
      list.sort((a, b) => (a.pos?.diagramY ?? 0) - (b.pos?.diagramY ?? 0));
      list.forEach((ch, i) => {
        const kind = deviceKind(ch.stencilId, ch.label, ch.zone);
        const baseZ = frame.layerZ[layer] ?? i * 2;
        const spread = (i - (list.length - 1) / 2) * 3.0;
        ch.semantic = { kind, mode: "network", layer, why: placementWhy(kind, layer, layer, "network") };
        ch.anchored = true;
        ch.pos.z = baseZ + spread * 0.45;
        ch.pos.x = ch.pos.x * 0.92 + spread * 0.2;
        if (kind === "ap") {
          ch.pos.y = 2.85;
          ch.mount = "ceiling";
        } else if (kind === "logical") {
          ch.pos.z = frame.demarcZ - 1.5;
          ch.pos.y = 1.55;
          ch.pos.x = Math.min(...chambers.map(c => c.pos.x)) - 2;
        } else if (kind === "firewall") {
          ch.pos.y = 1.15;
        } else {
          ch.pos.y = frame.isDc && /n9k|ucs|apic/i.test(ch.stencilId || "") ? 1.25 : 1.05;
        }
      });
    });
    constrainedRelax(chambers, "network");
    return frame;
  }

  function constrainedRelax(chambers, kind) {
    const minSep = kind === "room" ? 3.6 : 3.4;
    const maxStep = 0.22;
    const list = chambers.filter(c => c.pos && Number.isFinite(c.pos.x));
    for (let iter = 0; iter < 32; iter++) {
      let moved = false;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          let d = Math.hypot(dx, dz);
          if (d >= minSep) continue;
          if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
          const push = Math.min((minSep - d) / 2, maxStep);
          const ux = dx / d, uz = dz / d;
          if (!a.anchored || !b.anchored) {
            if (!a.anchored) { a.pos.x -= ux * push; a.pos.z -= uz * push; moved = true; }
            if (!b.anchored) { b.pos.x += ux * push; b.pos.z += uz * push; moved = true; }
          } else {
            const slide = push * 0.35;
            a.pos.x -= ux * slide; a.pos.z -= uz * slide;
            b.pos.x += ux * slide; b.pos.z += uz * slide;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }

  function applySemanticPlacement(chambers, nodes, kind, ctx = {}) {
    if (!chambers?.length) return null;
    if (kind === "room") {
      const placementById = ctx.placementById
        || (ctx.room ? resolveRoomPlacement(nodes, ctx.room, ctx.items) : null);
      return applyRoomSemantics(chambers, nodes, ctx.items, placementById);
    }
    return applyNetworkSemantics(chambers, nodes);
  }

  function nodeCenter(n) {
    return { x: n.x + (n.w || 76) / 2, y: n.y + (n.h || 46) / 2 };
  }

  function relaxWorldPositions(positions, nodes, kind) {
    const minSep = kind === "room" ? 3.95 : 3.6;
    const maxStep = kind === "room" ? 0.28 : 0.22;
    const ids = nodes.map(n => n.id).filter(id => positions[id]);
    if (ids.length < 2) return;
    for (let iter = 0; iter < 48; iter++) {
      let moved = false;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = positions[ids[i]], b = positions[ids[j]];
          let dx = b.x - a.x, dz = b.z - a.z;
          let d = Math.hypot(dx, dz);
          if (d >= minSep) continue;
          if (d < 1e-4) {
            const angle = ((i + 1) * 1.618 + (j + 1) * 0.733) * Math.PI;
            dx = Math.cos(angle); dz = Math.sin(angle); d = 1;
          }
          const push = Math.min((minSep - d) / 2, maxStep);
          const ux = dx / d, uz = dz / d;
          a.x -= ux * push; a.z -= uz * push;
          b.x += ux * push; b.z += uz * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  function diagramToWorld(nodes, kind) {
    if (!nodes?.length) return { positions: {}, bounds: null };
    const centers = nodes.map(n => ({ id: n.id, ...nodeCenter(n) }));
    const xs = centers.map(c => c.x);
    const ys = centers.map(c => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const scale = kind === "room" ? ROOM_SCALE : NET_SCALE;
    const positions = {};
    nodes.forEach(n => {
      const c = nodeCenter(n);
      const layer = n.layer || "access";
      const yLift = kind === "room" && /ceiling|mic/i.test(n.stencilId || n.label || "") ? 2.5 : 3;
      positions[n.id] = {
        x: (c.x - cx) * scale,
        y: yLift,
        z: (c.y - cy) * scale,
        diagramX: c.x,
        diagramY: c.y
      };
    });
    relaxWorldPositions(positions, nodes, kind);
    const wx = Object.values(positions).map(p => p.x);
    const wz = Object.values(positions).map(p => p.z);
    const pad = kind === "network" ? 10 : 8;
    const bounds = {
      minX: Math.min(...wx) - pad,
      maxX: Math.max(...wx) + pad,
      minZ: Math.min(...wz) - pad,
      maxZ: Math.max(...wz) + pad
    };
    return { positions, bounds, center: { cx, cy }, scale };
  }

  function layerAisles(chambers) {
    const byLayer = {};
    chambers.forEach(ch => {
      const layer = ch.zone || "default";
      if (!byLayer[layer]) byLayer[layer] = [];
      byLayer[layer].push(ch);
    });
    return Object.entries(byLayer).map(([layer, list]) => {
      const xs = list.map(c => c.pos.x);
      const zs = list.map(c => c.pos.z);
      return {
        layer,
        minX: Math.min(...xs) - 3,
        maxX: Math.max(...xs) + 3,
        minZ: Math.min(...zs) - 3,
        maxZ: Math.max(...zs) + 3,
        cx: (Math.min(...xs) + Math.max(...xs)) / 2,
        cz: (Math.min(...zs) + Math.max(...zs)) / 2
      };
    });
  }

  function roomZones(studio, roomId) {
    const room = studio?.design?.rooms?.find(r => r.id === roomId);
    if (!room?.computedZones) return [];
    return Object.entries(room.computedZones).map(([zone, rect]) => ({
      zone,
      x: (rect.x + rect.w / 2 - room.layoutOrigin?.x || 0) * ROOM_SCALE * 0.02,
      z: (rect.y + rect.h / 2 - room.layoutOrigin?.y || 0) * ROOM_SCALE * 0.02,
      w: rect.w * ROOM_SCALE * 0.02,
      h: rect.h * ROOM_SCALE * 0.02
    }));
  }

  function distToSegment(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1e-6;
    let t = ((px - ax) * dx + (pz - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx, qz = az + t * dz;
    return { dist: Math.hypot(px - qx, pz - qz), t, qx, qz };
  }

  /** Walkable pads + link segments aligned to diagram positions (single source of truth). */
  function buildWalkTopology(chambers, corridors, opts = {}) {
    if (!chambers?.length) return null;
    const padR = opts.padR ?? 2.4;
    const pathW = opts.pathWidth ?? 1.55;
    const cellSize = opts.cellSize ?? 2.15;

    const pads = chambers.map(ch => ({
      id: ch.id, x: ch.pos.x, z: ch.pos.z, r: padR, chamber: ch
    }));

    const segments = (corridors || []).map(cor => ({
      id: cor.id, cor,
      ax: cor.from.pos.x, az: cor.from.pos.z,
      bx: cor.to.pos.x, bz: cor.to.pos.z,
      width: pathW
    }));

    const xs = chambers.map(c => c.pos.x), zs = chambers.map(c => c.pos.z);
    const minX = Math.min(...xs) - 8, maxX = Math.max(...xs) + 8;
    const minZ = Math.min(...zs) - 8, maxZ = Math.max(...zs) + 8;
    const cols = Math.max(8, Math.ceil((maxX - minX) / cellSize) + 6);
    const rows = Math.max(8, Math.ceil((maxZ - minZ) / cellSize) + 6);
    const origin = { x: minX - 3 * cellSize, z: minZ - 3 * cellSize };

    const grid = Array.from({ length: rows }, () => Array(cols).fill(1));

    const toCell = (wx, wz) => ({
      c: Math.round((wx - origin.x) / cellSize),
      r: Math.round((wz - origin.z) / cellSize)
    });

    const cellToWorld = (r, c) => ({
      x: origin.x + c * cellSize,
      z: origin.z + r * cellSize
    });

    const carve = (r, c, rad = 1) => {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) grid[rr][cc] = 0;
        }
      }
    };

    const bresenham = (r0, c0, r1, c1, rad) => {
      if (![r0, c0, r1, c1].every(Number.isFinite)) return;
      let r = r0, c = c0;
      const dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0);
      const sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
      let err = dc - dr;
      let steps = 0;
      const maxSteps = rows * cols + 8;
      for (;;) {
        carve(r, c, rad);
        if (r === r1 && c === c1) break;
        if (++steps > maxSteps) break;
        const e2 = 2 * err;
        if (e2 > -dr) { err -= dc; r += sr; }
        if (e2 < dc) { err += dr; c += sc; }
      }
    };

    pads.forEach(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
      const cell = toCell(p.x, p.z);
      p.gr = cell.r;
      p.gc = cell.c;
      carve(cell.r, cell.c, 2);
    });

    segments.forEach(s => {
      if (![s.ax, s.az, s.bx, s.bz].every(Number.isFinite)) return;
      const a = toCell(s.ax, s.az), b = toCell(s.bx, s.bz);
      if (![a.r, a.c, b.r, b.c].every(Number.isFinite)) return;
      bresenham(a.r, a.c, b.r, b.c, 1);
    });

    const adj = {};
    chambers.forEach(ch => { adj[ch.id] = []; });
    segments.forEach(s => {
      const a = s.cor.from.id, b = s.cor.to.id;
      if (!adj[a]) adj[a] = [];
      if (!adj[b]) adj[b] = [];
      adj[a].push({ id: b, seg: s });
      adj[b].push({ id: a, seg: s });
    });

    function isWalkable(x, z) {
      for (const p of pads) {
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz <= p.r * p.r) return true;
      }
      for (const s of segments) {
        if (distToSegment(x, z, s.ax, s.az, s.bx, s.bz).dist <= s.width * 0.55) return true;
      }
      return false;
    }

    function findPath(fromId, toId) {
      if (fromId === toId) return [];
      const q = [fromId];
      const prev = { [fromId]: null };
      const via = {};
      while (q.length) {
        const id = q.shift();
        if (id === toId) {
          const segs = [];
          let cur = toId;
          while (prev[cur]) {
            segs.unshift(via[cur]);
            cur = prev[cur];
          }
          return segs;
        }
        for (const n of adj[id] || []) {
          if (prev[n.id] !== undefined) continue;
          prev[n.id] = id;
          via[n.id] = n.seg;
          q.push(n.id);
        }
      }
      return null;
    }

    function pathWaypoints(fromId, toId) {
      const segs = findPath(fromId, toId);
      if (!segs?.length) return null;
      return segs.map(s => ({ x: (s.ax + s.bx) / 2, z: (s.az + s.bz) / 2 }));
    }

    const spawnPad = pads[0];
    return {
      pads, segments, grid, origin, cellSize, rows, cols,
      toCell, cellToWorld, isWalkable, findPath, pathWaypoints,
      spawn: spawnPad ? { r: spawnPad.gr, c: spawnPad.gc } : { r: 2, c: 2 },
      corridors
    };
  }

  window.__DS_WALK_LAYOUT = {
    diagramToWorld, layerAisles, roomZones, nodeCenter,
    buildWalkTopology, distToSegment,
    applySemanticPlacement, buildRoomFrame, buildNetworkFrame,
    resolveRoomPlacement, clampToRoomFrame,
    deviceKind, placementWhy, NET_LAYER_Z, NET_LAYER_ORDER
  };
})();
