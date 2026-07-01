/**
 * Design Studio — 3D topology walkthrough
 */
(function () {
  "use strict";

  const CELL = 4;
  const MEDIA_COLORS = {
    cat6: 0xd4a060, cat6a: 0xe8b870, hdmi: 0x5ce0a8, usb: 0x44cc88,
    "fiber-sm": 0x6eb8ff, "fiber-mm": 0x6eb8ff, speaker: 0xc8a0e8, control: 0xc8a0e8
  };
  const ZONE_THEME = {
    display: { color: 0x1a4a38, accent: 0x44cc88, light: 0x5ce0a8 },
    ceiling: { color: 0x2a2048, accent: 0xa080e0, light: 0xc8a0ff },
    table: { color: 0x3a2810, accent: 0xff9933, light: 0xffb366 },
    rack: { color: 0x0a2848, accent: 0x02c8ff, light: 0x4ad4ff },
    wall: { color: 0x1a3050, accent: 0x66aadd, light: 0x88ccff },
    wan: { color: 0x102838, accent: 0x7ee8ff, light: 0xaaeeff },
    security: { color: 0x381028, accent: 0xff8cc4, light: 0xffaadd },
    core: { color: 0x102040, accent: 0x8ab4ff, light: 0xaaccff },
    access: { color: 0x0a2838, accent: 0x7ee8ff, light: 0x99eeff },
    collab: { color: 0x103828, accent: 0x8ee8b8, light: 0xaaffcc },
    default: { color: 0x142838, accent: 0x02c8ff, light: 0x55ddff }
  };
  const ZONE_3D = {
    display: { z: -14, y: 4, spread: 14 },
    ceiling: { z: -7, y: 9, spread: 12 },
    table: { z: 0, y: 2, spread: 10 },
    rack: { z: 12, y: 2.5, spread: 12 },
    wall: { z: -12, y: 5, spread: 12 },
    default: { z: 0, y: 3, spread: 10 }
  };
  const NET_LAYER_Z = { wan: -18, security: -12, core: -6, distribution: 0, dc: 2, access: 8, mgmt: 4, collab: 12 };

  const EYE_HEIGHT = 1.62;
  const PLAYER_R = 0.4;

  // Camera glide pacing (walk speed — ~3s short hops, ~6s longer runs).
  const FLY_DUR_MIN = 2.8;
  const FLY_DUR_MAX = 6.0;
  const FLY_DIST_SCALE = 0.52;
  const WALK_ONBOARD_KEY = "cpn-ds-walk-onboarded";
  const WALK_INSIGHTS_OFF_KEY = "cpn-ds-walk-insights-off";
  const WALK_PACKETS_KEY = "cpn-ds-walk-packets";
  const PACKET_SPEEDS = [
    { mult: 0.5, label: "Slow" },
    { mult: 1, label: "Normal" },
    { mult: 2, label: "Fast" }
  ];

  const MOVE_KEYS = new Set(["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

  const NET_LAYER_FILTERS = [
    { key: "all", label: "All" },
    { key: "wan", label: "WAN" },
    { key: "security", label: "Security" },
    { key: "core", label: "Core" },
    { key: "distribution", label: "Dist" },
    { key: "access", label: "Access" },
    { key: "collab", label: "Collab" }
  ];

  const state = {
    studio: null, mode: null, overlay: null, animId: 0, clock: 0, lastFrame: 0,
    THREE: null, renderer: null, scene: null, camera: null, raycaster: null,
    keys: {}, pointerLocked: false, lookDrag: false, lookLast: { x: 0, y: 0 },
    yaw: 0, pitch: 0, facing: 0, vel: { x: 0, y: 0, z: 0 }, onGround: true,
    pos: { x: 0, y: EYE_HEIGHT, z: 0 }, fly: null,
    thirdPerson: true, avatar: null,
    chambers: [], devicePods: [], cables: [], colliders: [], bounds: null,
    graph: null, texCache: new Map(), disposables: [],
    focusId: null, navIndex: 0, nearChamber: null,
    reticleChamber: null, bobPhase: 0, viewmodel: null, worldBounds: null,
    dustParticles: null, footPhase: 0,
    topology: null, easyNav: true, route: null, environmentTags: {},
    semanticFrame: null, layerFilter: "all",
    packetsEnabled: true, packetSpeedIdx: 1,
    quest: null
  };

  function syncWalkIfOpen(studio) {
    if (!studio || !state.mode) return null;
    return rebuild(studio);
  }

  function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function zoneTheme(zone) {
    return ZONE_THEME[zone] || ZONE_THEME.default;
  }

  function chamberPhoto(stencilId, canvas) {
    const mode = canvas === "room" ? "room" : "network";
    const def = window.__DS_STENCILS?.getDef?.(stencilId, mode);
    return window.__DS_PHOTOS?.resolveUrl?.(stencilId, def) || null;
  }

  function tplItemForNode(studio, room, node) {
    const tpl = window.__DS_TEMPLATES?.ROOM_TEMPLATES?.[room.template];
    if (!tpl?.items) return null;
    return tpl.items.find(it => it.label === node.label)
      || tpl.items.find(it => it.stencilId === node.stencilId);
  }

  function nodeChamberPos(room, node, item) {
    const zone = item?.zone || "default";
    const zc = ZONE_3D[zone] || ZONE_3D.default;
    const rx = item?.relX ?? 0.5;
    const x = (rx - 0.5) * zc.spread * 2;
    return { x, y: zc.y, z: zc.z };
  }

  function makeChamberBase(studio, n, extra) {
    const def = window.__DS_STENCILS?.getDef?.(n.stencilId, n.canvas === "room" ? "room" : "network");
    const zone = extra?.zone || "default";
    return {
      id: n.id,
      stencilId: n.stencilId,
      label: n.label || def?.label || n.stencilId,
      pid: n.pid || def?.pid || "",
      zone,
      photoUrl: chamberPhoto(n.stencilId, n.canvas),
      pos: extra?.pos || { x: 0, y: 3, z: 0 },
      color: MEDIA_COLORS.cat6
    };
  }

  function applyDiagramLayout(studio, chambers, nodes, kind) {
    const layout = window.__DS_WALK_LAYOUT?.diagramToWorld(nodes, kind);
    if (!layout?.positions) return null;
    chambers.forEach(ch => {
      const p = layout.positions[ch.id];
      if (p) ch.pos = { x: p.x, y: p.y, z: p.z, diagramX: p.diagramX, diagramY: p.diagramY };
    });
    const wx = chambers.map(c => c.pos.x);
    const wz = chambers.map(c => c.pos.z);
    const pad = kind === "network" ? 10 : 8;
    const bounds = {
      minX: Math.min(...wx) - pad,
      maxX: Math.max(...wx) + pad,
      minZ: Math.min(...wz) - pad,
      maxZ: Math.max(...wz) + pad
    };
    return {
      bounds,
      diagram: { cx: layout.center.cx, cy: layout.center.cy, scale: layout.scale, kind }
    };
  }

  function recomputeBounds(chambers, kind) {
    const wx = chambers.map(c => c.pos.x).filter(Number.isFinite);
    const wz = chambers.map(c => c.pos.z).filter(Number.isFinite);
    if (!wx.length) return null;
    const pad = kind === "network" ? 10 : 8;
    return {
      minX: Math.min(...wx) - pad,
      maxX: Math.max(...wx) + pad,
      minZ: Math.min(...wz) - pad,
      maxZ: Math.max(...wz) + pad
    };
  }

  function buildRoomGraph(studio) {
    const roomId = studio.activeRoomId;
    const room = studio.design.rooms.find(r => r.id === roomId);
    if (!room) return null;
    const nodes = studio.design.nodes.filter(n => {
      if (n.roomId !== roomId) return false;
      const def = window.__DS_STENCILS?.getDef?.(n.stencilId, "room");
      if (def?.decorative && !/^display-/.test(n.stencilId || "")) return false;
      return true;
    });
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = studio.design.links.filter(l => nodeIds.has(l.from) && nodeIds.has(l.to));
    const chambers = nodes.map(n => {
      const item = tplItemForNode(studio, room, n);
      return makeChamberBase(studio, n, { zone: item?.zone || "default", pos: { x: 0, y: 3, z: 0 } });
    });
    const graph = linkGraph(room, chambers, links, "room");
    const layoutInfo = applyDiagramLayout(studio, graph.chambers, nodes, "room");
    const tpl = window.__DS_TEMPLATES?.ROOM_TEMPLATES?.[room.template];
    const placementById = window.__DS_WALK_LAYOUT?.resolveRoomPlacement?.(nodes, room, tpl?.items);
    graph.semanticFrame = window.__DS_WALK_LAYOUT?.applySemanticPlacement?.(
      graph.chambers, nodes, "room", { items: tpl?.items, room, placementById }
    );
    graph.layoutBounds = recomputeBounds(graph.chambers, "room") || layoutInfo?.bounds;
    graph.layoutDiagram = layoutInfo?.diagram;
    return graph;
  }

  function buildNetworkGraph(studio) {
    const nodes = studio.design.nodes.filter(n => {
      if (n.roomId || n.canvas === "room") return false;
      return !window.__DS_STENCILS?.getDef?.(n.stencilId, "network")?.decorative;
    });
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = studio.design.links.filter(l => nodeIds.has(l.from) && nodeIds.has(l.to));
    const chambers = nodes.map(n => {
      const layer = n.layer || "access";
      return makeChamberBase(studio, n, { zone: layer, pos: { x: 0, y: 3, z: 0 } });
    });
    const graph = linkGraph({ name: "Network topology" }, chambers, links, "network");
    const layoutInfo = applyDiagramLayout(studio, graph.chambers, nodes, "network");
    graph.semanticFrame = window.__DS_WALK_LAYOUT?.applySemanticPlacement?.(
      graph.chambers, nodes, "network", {}
    );
    graph.layoutBounds = recomputeBounds(graph.chambers, "network") || layoutInfo?.bounds;
    graph.layoutDiagram = layoutInfo?.diagram;
    return graph;
  }

  function linkGraph(room, chambers, links, kind) {
    const chamberMap = Object.fromEntries(chambers.map(c => [c.id, c]));
    const corridors = links.map(l => {
      const a = chamberMap[l.from], b = chamberMap[l.to];
      if (!a || !b) return null;
      return {
        id: l.id, from: a, to: b, media: l.media || "cat6",
        label: l.label || "Link", fromPort: l.fromPort, toPort: l.toPort,
        color: MEDIA_COLORS[l.media] || MEDIA_COLORS.cat6
      };
    }).filter(Boolean);
    return { room, chambers, corridors, kind };
  }

  function buildGraph(studio) {
    return studio.tab === "room" ? buildRoomGraph(studio) : buildNetworkGraph(studio);
  }

  function buildTopology(graph) {
    return window.__DS_WALK_LAYOUT?.buildWalkTopology?.(graph.chambers, graph.corridors) || null;
  }


  function addVoxelEnvironment(THREE, scene, bright = true) {
    // Image-based lighting (added separately) carries most of the ambient now,
    // so the punch-in lights are tuned for ACES tone mapping.
    scene.add(new THREE.AmbientLight(0xffffff, bright ? 0.42 : 0.3));
    const sun = new THREE.DirectionalLight(0xfff4d0, bright ? 1.25 : 0.85);
    sun.position.set(22, 46, 16);
    if (THREE.PCFSoftShadowMap !== undefined) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      c.near = 1; c.far = 160;
      c.left = -55; c.right = 55; c.top = 55; c.bottom = -55;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.02;
      c.updateProjectionMatrix?.();
    }
    scene.add(sun);
    state.sun = sun;
    const fill = new THREE.DirectionalLight(0x8ec8f8, 0.4);
    fill.position.set(-16, 22, -12);
    scene.add(fill);
  }

  // Procedural image-based lighting: a soft sky/ground "room" with a couple of
  // bright panels, prefiltered via PMREM. Gives all PBR (MeshStandard) device
  // models real reflections + ambient so metals read as metal, not flat paint.
  function addImageBasedLighting(THREE, scene, renderer) {
    if (!THREE.PMREMGenerator || !renderer) return;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader?.();
      const env = new THREE.Scene();
      const boxGeo = new THREE.BoxGeometry(24, 24, 24);
      const pos = boxGeo.attributes.position;
      const cols = [];
      const top = new THREE.Color(0xcfe7ff), bot = new THREE.Color(0x223040);
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) + 12) / 24;
        const c = bot.clone().lerp(top, Math.max(0, Math.min(1, t)));
        cols.push(c.r, c.g, c.b);
      }
      boxGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      const room = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
      env.add(room);
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      ceil.position.set(0, 11.8, 0); ceil.rotation.x = Math.PI / 2; env.add(ceil);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), new THREE.MeshBasicMaterial({ color: 0xaee0ff }));
      side.position.set(-11.8, 4, 0); side.rotation.y = Math.PI / 2; env.add(side);
      const rt = pmrem.fromScene(env, 0.04);
      scene.environment = rt.texture;
      state.envRT = rt;
      boxGeo.dispose();
      room.material.dispose();
      ceil.geometry.dispose(); ceil.material.dispose();
      side.geometry.dispose(); side.material.dispose();
      pmrem.dispose();
    } catch (e) {
      console.warn("[DS Walk] IBL skipped:", e);
    }
  }

  // Turn on shadow casting/receiving across the (small) static + device meshes.
  // Skips overlays, sprites, fake-AO blobs, hitboxes, and the route ribbon.
  function applySceneShadows() {
    const scene = state.scene;
    if (!scene) return;
    scene.traverse(o => {
      if (!o.isMesh || o.userData?.noShadow) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some(m => m && (m.visible === false || (m.transparent && m.depthWrite === false)))) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }

  function setupDiagramWorld(THREE, scene, bounds, graph) {
    const VOX = window.__DS_WALK_VOXEL;
    if (!VOX || !bounds) return;
    state.environmentTags = {};
    const sky = VOX.setBlockSky(THREE, scene);
    state.disposables.push(sky);
    VOX.addDiagramWorld(THREE, scene, bounds, graph, state.disposables);
    addAdaptiveVenue(THREE, scene, bounds, graph);
  }

  function setupAvatar(THREE, scene) {
    const VOX = window.__DS_WALK_VOXEL;
    if (!VOX) return;
    if (state.avatar) scene.remove(state.avatar);
    state.avatar = VOX.makeAvatar(THREE);
    scene.add(state.avatar);
    state.avatar.visible = state.thirdPerson;
  }

  // Pendulum walk cycle: opposite arm/leg swing while moving; gentle idle breathing.
  function animateAvatar(moving) {
    const parts = state.avatar?.userData?.parts;
    if (!parts) return;
    const sw = moving ? Math.sin(state.bobPhase) * 0.7 : Math.sin(state.clock * 1.6) * 0.05;
    parts.legL.rotation.x = sw;
    parts.legR.rotation.x = -sw;
    parts.armL.rotation.x = -sw * 0.85;
    parts.armR.rotation.x = sw * 0.85;
    if (parts.head) parts.head.rotation.x = moving ? Math.sin(state.bobPhase * 2) * 0.03 : 0;
  }

  function toggleCameraMode() {
    state.thirdPerson = !state.thirdPerson;
    if (state.avatar) state.avatar.visible = state.thirdPerson;
    if (state.viewmodel) state.viewmodel.visible = !state.thirdPerson;
    setStatus(state.thirdPerson ? "Third-person view (V to toggle)" : "First-person view (V to toggle)");
  }

  function sizeWalkCanvas(canvas) {
    const wrap = canvas.closest(".ds-walk-canvas-wrap") || canvas.parentElement;
    const rect = wrap?.getBoundingClientRect();
    const w = Math.max(Math.floor(rect?.width || wrap?.clientWidth || 800), 320);
    const h = Math.max(Math.floor(rect?.height || wrap?.clientHeight || 480), 260);
    canvas.width = w;
    canvas.height = h;
    return { w, h };
  }

  function waitForCanvasSize(canvas, maxTries = 30) {
    return new Promise(resolve => {
      let tries = 0;
      const tick = () => {
        const wrap = canvas.closest(".ds-walk-canvas-wrap") || canvas.parentElement;
        if ((wrap?.clientWidth || 0) > 48 && (wrap?.clientHeight || 0) > 48) return resolve(sizeWalkCanvas(canvas));
        if (++tries >= maxTries) return resolve(sizeWalkCanvas(canvas));
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  async function loadThree() {
    if (state.THREE) return state.THREE;
    if (window.__cpnWalkTHREE) { state.THREE = window.__cpnWalkTHREE; return state.THREE; }
    for (let i = 0; i < 40; i++) {
      if (window.__cpnWalkTHREE) { state.THREE = window.__cpnWalkTHREE; return state.THREE; }
      await new Promise(r => setTimeout(r, 50));
    }
    const url = new URL("vendor/three.module.min.js", document.baseURI).href;
    state.THREE = await import(/* @vite-ignore */ url);
    window.__cpnWalkTHREE = state.THREE;
    return state.THREE;
  }

  async function loadTexture(THREE, url) {
    if (!url) return null;
    if (state.texCache.has(url)) return state.texCache.get(url);
    const loader = new THREE.TextureLoader();
    try {
      const tex = await loader.loadAsync(url);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      state.texCache.set(url, tex);
      state.disposables.push(tex);
      return tex;
    } catch {
      return null;
    }
  }

  function makeCanvasTexture(THREE, drawFn, w = 512, h = 128) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    drawFn(canvas.getContext("2d"), w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    state.disposables.push(tex);
    return tex;
  }

  function makeFallbackIconTexture(THREE, label, theme) {
    return makeCanvasTexture(THREE, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#0c2840");
      g.addColorStop(1, "#142838");
      ctx.fillStyle = g;
      roundRect(ctx, 8, 8, w - 16, h - 16, 14);
      ctx.fill();
      ctx.strokeStyle = "#" + theme.accent.toString(16).padStart(6, "0");
      ctx.lineWidth = 3;
      roundRect(ctx, 8, 8, w - 16, h - 16, 14);
      ctx.stroke();
      ctx.fillStyle = "#e8f4ff";
      ctx.font = "bold 28px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText((label || "?").slice(0, 14), w / 2, h / 2 + 6);
    }, 256, 160);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makeLabelSprite(THREE, title, subtitle, theme) {
    const tex = makeCanvasTexture(THREE, (ctx, w, h) => {
      ctx.fillStyle = "rgba(4,16,31,0.92)";
      roundRect(ctx, 4, 4, w - 8, h - 8, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(2,200,255,0.45)";
      ctx.lineWidth = 2;
      roundRect(ctx, 4, 4, w - 8, h - 8, 10);
      ctx.stroke();
      ctx.fillStyle = "#f0f8ff";
      ctx.font = "bold 22px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText((title || "").slice(0, 22), w / 2, 42);
      if (subtitle) {
        ctx.fillStyle = "#9ec0dc";
        ctx.font = "600 16px system-ui,sans-serif";
        ctx.fillText(subtitle.slice(0, 24), w / 2, 72);
      }
      const accent = "#" + theme.accent.toString(16).padStart(6, "0");
      ctx.fillStyle = accent;
      ctx.fillRect(16, h - 18, w - 32, 4);
    }, 512, 96);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.4, 0.45, 1);
    sprite.renderOrder = 10;
    state.disposables.push(mat);
    return sprite;
  }

  function podLift(zone, kind, ch) {
    if (ch?.pos?.y && kind === "room") {
      if (zone === "table") return ch.pos.y;
      if (zone === "display" || zone === "wall") return ch.pos.y;
      if (zone === "ceiling") return ch.pos.y || 2.95;
      if (zone === "rack") return ch.pos.y || 1.05;
    }
    if (kind === "network") {
      if (ch?.mount === "ceiling" || ch?.pos?.y > 2) return ch.pos?.y || 2.85;
      return ch?.pos?.y || 1.05;
    }
    if (kind !== "room") return 1.05;
    const z = (zone || "").toLowerCase();
    if (z === "ceiling") return 3.1;
    if (z === "wall") return 2.0;
    if (z === "display") return 1.55;
    if (z === "rack") return 1.05;
    if (z === "table") return 0.82;
    return 1.1;
  }

  function attachRoleEffects(THREE, g, ch, kind, graph) {
    const dk = window.__DS_WALK_LAYOUT?.deviceKind?.(ch.stencilId, ch.label, ch.zone) || "default";
    if (dk === "ap") attachApCoverageRings(THREE, g);
    if (dk === "firewall") attachFirewallShield(THREE, g);
    if (dk === "codec") attachAvSignalBeam(THREE, g, ch, graph);
  }

  function attachApCoverageRings(THREE, g) {
    const group = new THREE.Group();
    group.position.y = 2.82;
    const rings = [];
    [2.0, 2.9, 3.7].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.05, r, 40),
        new THREE.MeshBasicMaterial({
          color: 0x22c55e, transparent: true, opacity: 0.2 + i * 0.06,
          side: THREE.DoubleSide, depthWrite: false
        })
      );
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);
      rings.push(ring);
    });
    g.add(group);
    g.userData.roleFx = { type: "ap", rings, phase: Math.random() * Math.PI * 2 };
  }

  function attachFirewallShield(THREE, g) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 2.0),
      new THREE.MeshBasicMaterial({
        color: 0xff6b35, transparent: true, opacity: 0.24,
        side: THREE.DoubleSide, depthWrite: false
      })
    );
    plane.position.set(0, 1.15, 0.85);
    g.add(plane);
    g.userData.roleFx = { type: "firewall", plane, phase: Math.random() * Math.PI * 2 };
  }

  function attachAvSignalBeam(THREE, g, ch, graph) {
    const cors = (graph?.corridors || []).filter(c => {
      if (c.from.id !== ch.id && c.to.id !== ch.id) return false;
      const other = c.from.id === ch.id ? c.to : c.from;
      const ok = /hdmi|usb|speaker|control/i.test(c.media || "")
        || /display|camera|codec|hdmi|usb|mic/i.test(c.label || "")
        || /display|camera|codec/i.test(other.stencilId || "");
      return ok;
    });
    if (!cors.length) return;
    const cor = cors[0];
    const other = cor.from.id === ch.id ? cor.to : cor.from;
    const ox = ch.pos?.x ?? 0;
    const oz = ch.pos?.z ?? 0;
    const tx = other.pos?.x ?? ox;
    const tz = other.pos?.z ?? oz;
    const dx = tx - ox;
    const dz = tz - oz;
    if (Math.hypot(dx, dz) < 0.5) return;
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 1.35, 0.15),
      new THREE.Vector3(dx, 1.35, dz)
    ]);
    const mat = new THREE.LineDashedMaterial({
      color: 0x7c3aed, transparent: true, opacity: 0.48,
      dashSize: 0.4, gapSize: 0.22, depthWrite: false
    });
    const beam = new THREE.Line(geom, mat);
    beam.computeLineDistances?.();
    g.add(beam);
    g.userData.roleFx = { type: "av", beam, phase: Math.random() * Math.PI * 2 };
  }

  function animateRoleEffects(t) {
    state.devicePods.forEach(pod => {
      const fx = pod.userData?.roleFx;
      if (!fx) return;
      if (fx.type === "ap" && fx.rings) {
        fx.rings.forEach((ring, i) => {
          const pulse = 0.5 + 0.5 * Math.sin(t * 1.1 + fx.phase + i * 0.65);
          ring.material.opacity = (0.14 + i * 0.04) * (0.7 + 0.75 * pulse);
          const s = 1 + 0.025 * pulse;
          ring.scale.set(s, s, 1);
        });
      } else if (fx.type === "firewall" && fx.plane) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.9 + fx.phase);
        fx.plane.material.opacity = 0.16 + 0.14 * pulse;
      } else if (fx.type === "av" && fx.beam) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + fx.phase);
        fx.beam.material.opacity = 0.2 + 0.16 * pulse;
      }
    });
  }

  async function makeDevicePod(THREE, ch, scale = 1, kind = "room", graph = null) {
    const theme = zoneTheme(ch.zone);
    const g = new THREE.Group();
    g.userData = { chamber: ch, kind: "pod" };
    const lift = podLift(ch.zone, kind, ch);
    const mode = kind === "room" ? "room" : "network";
    const def = window.__DS_STENCILS?.getDef?.(ch.stencilId, mode);

    let photoTex = await loadTexture(THREE, ch.photoUrl);
    if (!photoTex) photoTex = makeFallbackIconTexture(THREE, ch.label, theme);

    window.__DS_WALK_MODELS?.init?.(THREE);
    const deviceGroup = await window.__DS_WALK_MODELS?.build?.(THREE, {
      ch, def, kind, photoTex, scale, theme, lift
    });
    if (deviceGroup) {
      g.add(deviceGroup);
      if (deviceGroup.userData?.photoMesh) g.userData.photoMesh = deviceGroup.userData.photoMesh;
    }

    const modelTop = lift + (kind === "room" ? 1.2 : 0.95) * scale;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55 * scale, 0.62 * scale, 32),
      new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.1, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03 * scale;
    g.add(ring);

    const glow = new THREE.PointLight(theme.light, 0.06 * scale, 3.2 * scale);
    glow.position.set(0, modelTop * 0.65, 0.15 * scale);
    glow.userData.podGlow = true;
    g.add(glow);

    const label = makeLabelSprite(THREE, ch.label, ch.pid, theme);
    label.position.set(0, modelTop + 0.25, 0);
    label.visible = false;
    g.add(label);

    const zoneBadge = makeLabelSprite(THREE, (ch.zone || "device").toUpperCase(), "", theme);
    zoneBadge.scale.set(1.2 * scale, 0.24 * scale, 1);
    zoneBadge.position.set(0, lift + 0.15, 0.05);
    zoneBadge.visible = false;
    g.add(zoneBadge);

    g.userData.labelSprite = label;
    g.userData.zoneBadge = zoneBadge;
    g.userData.glowLight = glow;
    g.userData.ring = ring;
    g.userData.deviceGroup = deviceGroup;

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.7 * scale, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    g.add(shadow);

    const hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(1.8 * scale, 10, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.set(0, lift, 0);
    hitbox.userData = { chamber: ch, kind: "hitbox" };
    g.add(hitbox);

    g.position.set(ch.pos.x, 0, ch.pos.z);
    g.rotation.y = podFaceYaw(ch);
    attachRoleEffects(THREE, g, ch, kind, graph);
    state.devicePods.push(g);
    state.colliders.push({ x: ch.pos.x, z: ch.pos.z, r: 0.55 * scale, id: ch.id, kind: "pod" });
    return g;
  }

  function podFaceYaw(ch) {
    if (Number.isFinite(ch.faceYaw)) return ch.faceYaw;
    const cors = state.graph?.corridors?.filter(c => c.from.id === ch.id || c.to.id === ch.id) || [];
    if (!cors.length) return 0;
    const cor = cors[0];
    const other = cor.from.id === ch.id ? cor.to : cor.from;
    const p = chamberWorldPos(ch);
    const op = chamberWorldPos(other);
    return Math.atan2(op.x - p.x, op.z - p.z);
  }

  // Tracks how many links already drawn between each unordered device pair,
  // so parallel/overlapping links fan out instead of stacking on top of each
  // other (mirrors 3d-force-graph's linkCurveRotation technique).
  const _pairCount = {};

  // Height at which a cable plugs into a device, derived from the device's
  // zone lift so cables terminate ON the device (ceiling mics/APs float high,
  // table mics sit low) instead of a fixed mid-air height.
  function cablePortY(ch) {
    const kind = state.graph?.kind || "room";
    const z = (ch?.zone || "").toLowerCase();
    const lift = podLift(z, kind, ch);
    if (kind !== "room") return lift + 0.4;    // network chassis: into the body
    if (z === "ceiling") return lift + 0.55;   // plug into the stem of a hanging mic/AP
    if (z === "wall" || z === "display") return lift + 0.15;
    return lift + 0.45;                        // table / rack / default: into the body
  }

  function makeCableRun(THREE, cor) {
    const ax = cor.from.pos.x, az = cor.from.pos.z;
    const bx = cor.to.pos.x, bz = cor.to.pos.z;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 0.1;
    const g = new THREE.Group();
    const color = cor.color ?? 0x02c8ff;

    // Each end plugs in at its own device height so the cable visibly reaches
    // the device (ceiling mics sit ~3m up, table mics low, switches mid).
    const ya = cablePortY(cor.from);
    const yb = cablePortY(cor.to);
    const a = new THREE.Vector3(ax, ya, az);
    const b = new THREE.Vector3(bx, yb, bz);

    // Arc the cable up and over the higher endpoint. Longer runs arc higher;
    // siblings between the same pair are nudged sideways + up so every
    // connection stays traceable.
    const pairKey = [cor.from.id, cor.to.id].sort().join("|");
    const sib = _pairCount[pairKey] = (_pairCount[pairKey] || 0) + 1;
    const baseY = Math.max(ya, yb);
    const arch = Math.min(Math.max(len * 0.26, 1.2), 5.0) + (sib - 1) * 0.85;
    const perp = new THREE.Vector3(-dz, 0, dx).normalize();
    const lateral = ((sib - 1) % 2 === 0 ? 1 : -1) * Math.ceil((sib - 1) / 2) * 1.1;
    const mid = new THREE.Vector3(
      (ax + bx) / 2 + perp.x * lateral,
      baseY + arch,
      (az + bz) / 2 + perp.z * lateral
    );
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);

    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 28, 0.085, 7, false),
      new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.55,
        metalness: 0.3, roughness: 0.5
      })
    );
    g.add(tube);

    const roomWalk = state.graph?.kind === "room";
    // Connector collars only in network walk — room devices are small; collars obscure product photos.
    if (!roomWalk) {
      const outA = new THREE.Vector3().subVectors(mid, a).normalize();
      const outB = new THREE.Vector3().subVectors(mid, b).normalize();
      [ { p: a, out: outA }, { p: b, out: outB } ].forEach(({ p, out }) => {
        const collar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.072, 0.14, 10),
          new THREE.MeshStandardMaterial({
            color: 0x14202e, emissive: color, emissiveIntensity: 0.32,
            metalness: 0.55, roughness: 0.38
          })
        );
        collar.position.copy(p).addScaledVector(out, 0.08);
        g.add(collar);
      });
    }

    // Packets flow from source → target along the curve (data direction).
    const pktR = roomWalk ? 0.16 : 0.12;
    const haloR = roomWalk ? 0.3 : 0.22;
    const packetCount = Math.max(2, Math.min(5, Math.round(len / 5)));
    for (let i = 0; i < packetCount; i++) {
      const pkt = new THREE.Mesh(
        new THREE.SphereGeometry(pktR, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(haloR, 12, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })
      );
      pkt.add(halo);
      pkt.userData = { packet: true, t: i / packetCount };
      g.add(pkt);
    }

    g.userData = { corridor: cor, curve };
    state.cables.push(g);
    return g;
  }

  function makeFloorTexture(THREE) {
    return makeCanvasTexture(THREE, (ctx, w, h) => {
      ctx.fillStyle = "#0a1420";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        for (let x = 0; x < w; x += 32) {
          ctx.strokeStyle = (x + y) % 64 === 0 ? "rgba(2,200,255,0.12)" : "rgba(2,200,255,0.04)";
          ctx.strokeRect(x + 0.5, y + 0.5, 31, 31);
        }
      }
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.55);
      g.addColorStop(0, "rgba(2,200,255,0.08)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, 512, 512);
  }

  function addRoomDecor(THREE, scene, bounds) {
    if (!bounds) return;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 0.62, metalness: 0.08 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.1, 2.4), wood);
    table.position.set(cx, 0.38, cz);
    scene.add(table);
    const legs = [[-2.4, -0.9], [2.4, -0.9], [-2.4, 0.9], [2.4, 0.9]];
    legs.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.38, 8), wood);
      leg.position.set(cx + lx, 0.19, cz + lz);
      scene.add(leg);
    });
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x2a3238, roughness: 0.7, metalness: 0.2 });
    [[-1.2, 1.8], [1.2, 1.8], [-1.2, -1.8], [1.2, -1.8]].forEach(([ox, oz]) => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), chairMat);
      seat.position.set(cx + ox, 0.42, cz + oz);
      scene.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.06), chairMat);
      back.position.set(cx + ox, 0.68, cz + oz + (oz > 0 ? 0.24 : -0.24));
      scene.add(back);
    });
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1.8, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.3, roughness: 0.4, emissive: 0x223344, emissiveIntensity: 0.15 })
    );
    screen.position.set(cx, 2.1, cz - 3.2);
    scene.add(screen);
    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.2, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x1a2028, metalness: 0.75, roughness: 0.35 })
    );
    rack.position.set(cx + 4.5, 1.1, cz - 2.5);
    scene.add(rack);
  }

  function envTag(tag) {
    state.environmentTags[tag] = (state.environmentTags[tag] || 0) + 1;
  }

  function addTagged(scene, obj, tag) {
    obj.userData = { ...(obj.userData || {}), environmentTag: tag };
    envTag(tag);
    scene.add(obj);
    return obj;
  }

  function box(THREE, scene, tag, size, pos, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    return addTagged(scene, m, tag);
  }

  function addCeilingGrid(THREE, scene, bounds, h = 3.15) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8e1e8, metalness: 0.2, roughness: 0.55, transparent: true, opacity: 0.55 });
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const w = bounds.maxX - bounds.minX + 8;
    const d = bounds.maxZ - bounds.minZ + 8;
    for (let x = bounds.minX - 4; x <= bounds.maxX + 4; x += 4) {
      box(THREE, scene, "room-ceiling-grid", [0.035, 0.035, d], [x, h, cz], mat);
    }
    for (let z = bounds.minZ - 4; z <= bounds.maxZ + 4; z += 4) {
      box(THREE, scene, "room-ceiling-grid", [w, 0.035, 0.035], [cx, h, z], mat);
    }
  }

  function addSeatRows(THREE, scene, bounds, rows = 4) {
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x28303a, roughness: 0.75, metalness: 0.15 });
    const cx = (bounds.minX + bounds.maxX) / 2;
    const width = Math.max(bounds.maxX - bounds.minX - 5, 10);
    for (let r = 0; r < rows; r++) {
      const z = bounds.minZ + 6 + r * 2.2;
      box(THREE, scene, "room-seat-row", [width, 0.18, 0.55], [cx, 0.45, z], seatMat);
      box(THREE, scene, "room-seat-row", [width, 0.65, 0.08], [cx, 0.82, z + 0.32], seatMat);
    }
  }

  function addConferenceFurniture(THREE, scene, bounds, graph) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 0.62, metalness: 0.08 });
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x2a3238, roughness: 0.7, metalness: 0.2 });
    const tableChambers = (graph.chambers || []).filter(ch => /table|mic/i.test(ch.zone || "") || /table/i.test(ch.label || ""));
    const xs = tableChambers.length ? tableChambers.map(ch => ch.pos.x) : [bounds.minX + 4, bounds.maxX - 4];
    const zs = tableChambers.length ? tableChambers.map(ch => ch.pos.z) : [bounds.minZ + 5, bounds.maxZ - 5];
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const tw = Math.max(4.8, Math.min(12, Math.max(...xs) - Math.min(...xs) + 4));
    const td = Math.max(2.0, Math.min(4.2, Math.max(...zs) - Math.min(...zs) + 2.2));
    box(THREE, scene, "room-table", [tw, 0.12, td], [cx, 0.38, cz], wood);
    const seats = Math.max(4, Math.min(12, Math.round(tw / 1.2) * 2));
    for (let i = 0; i < seats / 2; i++) {
      const x = cx - tw / 2 + 0.75 + i * ((tw - 1.5) / Math.max(1, seats / 2 - 1));
      [-1, 1].forEach(side => {
        box(THREE, scene, "room-chair", [0.55, 0.1, 0.55], [x, 0.42, cz + side * (td / 2 + 0.55)], chairMat);
        box(THREE, scene, "room-chair", [0.55, 0.48, 0.08], [x, 0.72, cz + side * (td / 2 + 0.86)], chairMat);
      });
    }
  }

  function addRoomVenue(THREE, scene, bounds, graph) {
    const template = String(graph.room?.template || "");
    const frame = graph.semanticFrame || {};
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.78, metalness: 0.15 });
    const cx = (bounds.minX + bounds.maxX) / 2;
    const frontZ = Number.isFinite(frame.frontZ) ? frame.frontZ - 0.35 : bounds.minZ - 2.5;
    const hasDisplayDevice = (graph.chambers || []).some(ch =>
      /display/i.test(ch.stencilId || "") || ch.semantic?.kind === "display");
    box(THREE, scene, "room-front-wall", [Math.max(bounds.maxX - bounds.minX + 8, 16), 3.2, 0.18], [cx, 1.6, frontZ], wallMat);
    if (/auditorium|training/i.test(template)) {
      box(THREE, scene, "room-stage", [Math.max(bounds.maxX - bounds.minX - 4, 8), 0.22, 1.8], [cx, 0.13, frontZ + 2.1], new THREE.MeshStandardMaterial({ color: 0x40362b, roughness: 0.7 }));
    }
    if (!hasDisplayDevice) {
      const displayMat = new THREE.MeshStandardMaterial({ color: 0x05070a, emissive: 0x143448, emissiveIntensity: 0.22, metalness: 0.35, roughness: 0.45 });
      box(THREE, scene, "room-display-wall", [4.8, 2.1, 0.12], [cx, 2.0, frontZ + 0.12], displayMat);
    }
    if (/auditorium|training/i.test(template)) addSeatRows(THREE, scene, bounds, /auditorium/i.test(template) ? 5 : 3);
    else addConferenceFurniture(THREE, scene, bounds, graph);
    if (/openDesk|desk/i.test(template)) {
      const dividerMat = new THREE.MeshStandardMaterial({ color: 0x51616e, roughness: 0.8, transparent: true, opacity: 0.75 });
      for (let z = bounds.minZ + 3; z < bounds.maxZ - 2; z += 4) {
        box(THREE, scene, "room-desk-divider", [Math.max(bounds.maxX - bounds.minX - 5, 8), 1.1, 0.08], [cx, 0.8, z], dividerMat);
      }
    }
  }

  function addNetworkVenue(THREE, scene, bounds, graph) {
    // Floor-only network walk — no closet walls, rack rows, or ceiling decor.
  }

  function addAdaptiveVenue(THREE, scene, bounds, graph) {
    if (!bounds || !graph) return;
    if (graph.kind === "room") addRoomVenue(THREE, scene, bounds, graph);
    else addNetworkVenue(THREE, scene, bounds, graph);
  }

  function makeCarpetTexture(THREE) {
    return makeCanvasTexture(THREE, (ctx, w, h) => {
      ctx.fillStyle = "#3a3835";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 8000; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const g = 40 + Math.random() * 30;
        ctx.fillStyle = `rgba(${g},${g - 4},${g - 8},0.35)`;
        ctx.fillRect(x, y, 1, 1);
      }
    }, 256, 256);
  }

  function setSkyBackground(THREE, scene, kind) {
    const tex = makeCanvasTexture(THREE, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      if (kind === "network") {
        g.addColorStop(0, "#243040");
        g.addColorStop(0.45, "#141c28");
        g.addColorStop(1, "#0a1018");
      } else {
        g.addColorStop(0, "#2a3848");
        g.addColorStop(0.5, "#1a2430");
        g.addColorStop(1, "#101820");
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, 4, 1024);
    scene.background = tex;
  }

  function addEpicVenue(THREE, scene, bounds, kind) {
    if (!bounds) return;
    const pad = 16;
    const w = Math.max(bounds.maxX - bounds.minX + pad * 2, 32);
    const d = Math.max(bounds.maxZ - bounds.minZ + pad * 2, 32);
    const h = kind === "room" ? 9 : 11;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    setSkyBackground(THREE, scene, kind);

    const floorTex = kind === "room" ? makeCarpetTexture(THREE) : makeFloorTexture(THREE);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(w / 6, d / 6);

    const floorColor = kind === "network" ? 0x2a3038 : 0x888880;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({
        map: floorTex, color: floorColor, metalness: kind === "network" ? 0.55 : 0.25,
        roughness: kind === "network" ? 0.42 : 0.72
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({
      color: kind === "network" ? 0x141c26 : 0x2a323c, metalness: 0.35, roughness: 0.78
    });
    const walls = [
      { sx: w, sz: 0.5, x: cx, z: cz - d / 2 },
      { sx: w, sz: 0.5, x: cx, z: cz + d / 2 },
      { sx: 0.5, sz: d, x: cx - w / 2, z: cz },
      { sx: 0.5, sz: d, x: cx + w / 2, z: cz }
    ];
    walls.forEach(wl => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(wl.sx, h, wl.sz), wallMat);
      wall.position.set(wl.x, h / 2, wl.z);
      scene.add(wall);
    });

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0x0e141c, metalness: 0.2, roughness: 0.92, side: THREE.DoubleSide })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, h, cz);
    scene.add(ceil);

    const gridN = kind === "network" ? 4 : 3;
    const corners = [[0, 0], [gridN - 1, 0], [0, gridN - 1], [gridN - 1, gridN - 1]];
    corners.forEach(([i, j]) => {
      const lx = cx + (i / (gridN - 1) - 0.5) * w * 0.85;
      const lz = cz + (j / (gridN - 1) - 0.5) * d * 0.85;
      const bulb = new THREE.PointLight(kind === "network" ? 0xc8dce8 : 0xffeedd, 0.45, 22, 2);
      bulb.position.set(lx, h - 0.6, lz);
      scene.add(bulb);
    });
  }

  function addDustParticles(THREE, scene, bounds) {
    if (!bounds) return;
    const count = 60;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const spreadX = (bounds.maxX - bounds.minX) + 10;
    const spreadZ = (bounds.maxZ - bounds.minZ) + 10;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = cx + (Math.random() - 0.5) * spreadX;
      pos[i * 3 + 1] = 1 + Math.random() * 8;
      pos[i * 3 + 2] = cz + (Math.random() - 0.5) * spreadZ;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaaccdd, size: 0.04, transparent: true, opacity: 0.12, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.userData.dust = true;
    scene.add(pts);
    state.dustParticles = pts;
  }

  function addEnvironment(THREE, scene, dark = false) {
    scene.fog = new THREE.FogExp2(dark ? 0x020610 : 0x060e1a, dark ? 0.038 : 0.022);
    scene.add(new THREE.HemisphereLight(0x6688aa, 0x040810, dark ? 0.35 : 0.45));
    const dir = new THREE.DirectionalLight(0x99ccee, dark ? 0.55 : 0.75);
    dir.position.set(10, 24, 8);
    scene.add(dir);
    const rim = new THREE.DirectionalLight(0x02c8ff, dark ? 0.18 : 0.28);
    rim.position.set(-12, 8, -14);
    scene.add(rim);
    const amb = new THREE.AmbientLight(0x1a2840, dark ? 0.25 : 0.35);
    scene.add(amb);
  }

  function addWorldScenery(THREE, scene, graph) {
    if (graph.kind !== "network") return;
    const layers = [...new Set(graph.chambers.map(c => c.zone).filter(Boolean))];
    layers.forEach(layer => {
      const list = graph.chambers.filter(c => c.zone === layer);
      if (!list.length) return;
      const xs = list.map(c => c.pos.x), zs = list.map(c => c.pos.z);
      const minX = Math.min(...xs) - 2, maxX = Math.max(...xs) + 2;
      const minZ = Math.min(...zs) - 2, maxZ = Math.max(...zs) + 2;
      const theme = zoneTheme(layer);
      const lane = new THREE.Mesh(
        new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
        new THREE.MeshStandardMaterial({
          color: theme.color, transparent: true, opacity: 0.08,
          metalness: 0.3, roughness: 0.9, depthWrite: false
        })
      );
      lane.rotation.x = -Math.PI / 2;
      lane.position.set((minX + maxX) / 2, 0.02, (minZ + maxZ) / 2);
      scene.add(lane);
      const sign = makeLabelSprite(THREE, layer.toUpperCase(), "", theme);
      sign.position.set((minX + maxX) / 2, 2.4, minZ - 0.5);
      sign.scale.set(1.2, 0.24, 1);
      sign.material.opacity = 0.45;
      scene.add(sign);
    });
  }

  function makeViewmodel(THREE, camera) {
    const VOX = window.__DS_WALK_VOXEL;
    if (VOX?.makeBlockViewmodel) {
      const vm = VOX.makeBlockViewmodel(THREE, camera);
      vm.visible = !state.thirdPerson;
      return vm;
    }
    const g = new THREE.Group();
    g.userData.kind = "viewmodel";
    camera.add(g);
    return g;
  }

  async function loadDevicePods(THREE, graph, scale = 1) {
    for (const ch of graph.chambers) {
      if (!Number.isFinite(ch.pos?.x) || !Number.isFinite(ch.pos?.z)) {
        ch.pos = { x: 0, y: ch.pos?.y ?? 3, z: 0 };
      }
      try {
        const pod = await makeDevicePod(THREE, ch, scale, graph.kind, graph);
        state.scene?.add(pod);
      } catch (err) {
        console.warn("[DS Walk] pod skipped:", ch.label, err);
      }
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  async function initCorridor(studio, canvas, graph) {
    const THREE = await loadThree();
    if (!graph?.chambers.length) throw new Error("no-graph");
    state.graph = graph;
    state.devicePods = [];
    state.cables = [];
    state.colliders = [];

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x8ec8f8, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace || renderer.outputEncoding;
    if (THREE.ACESFilmicToneMapping) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
    }
    if (THREE.PCFSoftShadowMap !== undefined) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    state.renderer = renderer;

    const scene = new THREE.Scene();
    state.scene = scene;
    addVoxelEnvironment(THREE, scene, true);
    addImageBasedLighting(THREE, scene, renderer);
    state.bounds = graph.layoutBounds || {
      minX: Math.min(...graph.chambers.map(c => c.pos.x)) - 8,
      maxX: Math.max(...graph.chambers.map(c => c.pos.x)) + 8,
      minZ: Math.min(...graph.chambers.map(c => c.pos.z)) - 8,
      maxZ: Math.max(...graph.chambers.map(c => c.pos.z)) + 8
    };
    setupDiagramWorld(THREE, scene, state.bounds, graph);

    const camera = new THREE.PerspectiveCamera(76, 1, 0.1, 220);
    camera.rotation.order = "YXZ";
    state.camera = camera;
    scene.add(camera);
    setupAvatar(THREE, scene);
    state.viewmodel = makeViewmodel(THREE, camera);
    state.raycaster = new THREE.Raycaster();

    state.topology = buildTopology(graph);
    Object.keys(_pairCount).forEach(k => delete _pairCount[k]);
    graph.corridors.forEach(cor => scene.add(makeCableRun(THREE, cor)));
    populateLegend(graph);

    const spawn = graph.chambers.find(c => /switch|9200|9300/i.test(c.label)) || graph.chambers[0];
    state.chambers = graph.chambers;
    teleportToChamber(spawn, true);
    state.navIndex = graph.chambers.indexOf(spawn);
    document.getElementById("ds-walk-minimap")?.removeAttribute("hidden");
    buildDeviceNav(graph.chambers);
    buildConnectedNav(spawn);
    resizeRenderer();

    applySceneShadows();
    setStatus("Loading devices…");
    loadDevicePods(THREE, graph, 1).then(() => {
      applySceneShadows();
      if (window.__cpnAutoOutcomes && !state.outcomes && graph.kind === "room" && !insightsUserDismissed()) {
        window.__cpnAutoOutcomes = false;
        toggleOutcomes();
      }
      if (state.mode) setStatus("Follow a connected link below, or use ‹ Prev / Next › to walk devices");
      showWalkOnboardHint();
      window.__DS_WALK_QUEST?.syncQuestButton?.(studio);
      window.__DS_WALK_LAYOUT_MODE?.syncHud?.();
    });
  }

  function resizeRenderer() {
    const wrap = state.overlay?.querySelector(".ds-walk-canvas-wrap");
    if (!wrap || !state.renderer || !state.camera) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    state.renderer.setSize(w, h, false);
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
  }

  function snapToWalkable(x, z) {
    const topo = state.topology;
    if (!topo?.isWalkable || topo.isWalkable(x, z)) return { x, z };
    for (let r = 0.4; r < 8; r += 0.45) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
        if (topo.isWalkable(tx, tz)) return { x: tx, z: tz };
      }
    }
    return { x, z };
  }

  function chamberApproachDir(ch) {
    const p = chamberWorldPos(ch);
    const cors = state.graph?.corridors?.filter(c => c.from.id === ch.id || c.to.id === ch.id) || [];
    if (!cors.length) return { dx: 0, dz: 1 };
    const other = cors[0].from.id === ch.id ? cors[0].to : cors[0].from;
    const op = chamberWorldPos(other);
    const dx = p.x - op.x, dz = p.z - op.z;
    const len = Math.hypot(dx, dz) || 1;
    return { dx: dx / len, dz: dz / len };
  }

  function chamberStandPos(ch) {
    const p = chamberWorldPos(ch);
    const pad = state.topology?.pads?.find(pad => pad.id === ch.id);
    const standDist = Math.min(pad?.r ? pad.r * 0.95 : 3.2, 3.6);
    const dir = chamberApproachDir(ch);
    const stand = {
      x: p.x + dir.dx * standDist,
      z: p.z + dir.dz * standDist,
      y: EYE_HEIGHT
    };
    if (state.topology?.isWalkable) {
      const snap = snapToWalkable(stand.x, stand.z);
      stand.x = snap.x;
      stand.z = snap.z;
    }
    const safe = resolveCollision(stand.x, stand.z);
    stand.x = safe.x;
    stand.z = safe.z;
    stand.y = EYE_HEIGHT;
    return stand;
  }

  function faceChamber(ch) {
    const p = chamberWorldPos(ch);
    state.yaw = Math.atan2(p.x - state.pos.x, p.z - state.pos.z);
    state.facing = state.yaw;
    state.pitch = -0.06;
  }

  function teleportToChamber(ch, instant) {
    if (!ch) return;
    if (!instant) cancelMotion();
    const dest = chamberStandPos(ch);
    const prev = state.chambers[state.navIndex];
    if (!instant && prev && prev.id !== ch.id) startWayfinding(ch, prev);
    state.navIndex = Math.max(0, state.chambers.indexOf(ch));
    highlightNavChip(ch.id);
    buildConnectedNav(ch);

    if (!instant && prev && prev.id !== ch.id && state.topology?.pathWaypoints) {
      const path = state.topology.pathWaypoints(prev.id, ch.id);
      if (path?.length) {
        state.fly = {
          from: { ...state.pos },
          path,
          i: 0,
          t: 0,
          chamber: ch,
          dest
        };
        state.vel = { x: 0, y: 0, z: 0 };
        setStatus(`Walking to ${ch.label}…`);
        return;
      }
    }

    if (instant) {
      state.pos = { ...dest };
      state.vel = { x: 0, y: 0, z: 0 };
      faceChamber(ch);
      state.fly = null;
      setStatus(`At ${ch.label}${ch.pid ? " · " + ch.pid : ""}`);
    } else {
      const dist = Math.hypot(dest.x - state.pos.x, dest.z - state.pos.z);
      state.fly = {
        from: { ...state.pos },
        to: dest,
        yawFrom: state.yaw,
        yawTo: Math.atan2(chamberWorldPos(ch).x - dest.x, chamberWorldPos(ch).z - dest.z),
        t: 0,
        dur: flyDuration(dist),
        chamber: ch
      };
      state.vel = { x: 0, y: 0, z: 0 };
      setStatus(`Walking to ${ch.label}…`);
    }
  }

  function chambersForNav() {
    if (state.graph?.kind !== "network" || state.layerFilter === "all") return state.chambers;
    return state.chambers.filter(c => (c.zone || "") === state.layerFilter);
  }

  function flyToChamberById(id) {
    const ch = state.chambers.find(c => c.id === id);
    if (ch) teleportToChamber(ch, false);
  }

  function cycleDevice(dir) {
    const list = chambersForNav();
    if (!list.length) return;
    const cur = state.chambers[state.navIndex];
    let idx = list.findIndex(c => c.id === cur?.id);
    if (idx < 0) idx = 0;
    idx = (idx + dir + list.length) % list.length;
    teleportToChamber(list[idx], false);
  }

  // ---- Cisco Spaces–style wayfinding ("Take me there") ----------------------
  // Reconstructs the ordered chamber sequence for the shortest topology route so
  // we can draw a continuous on-floor path instead of disconnected segments.
  function routeNodeIds(fromId, toId) {
    const segs = state.topology?.findPath?.(fromId, toId);
    if (!segs?.length) return null;
    const ids = [fromId];
    let cur = fromId;
    for (const s of segs) {
      const next = s.cor.from.id === cur ? s.cor.to.id : s.cor.from.id;
      ids.push(next);
      cur = next;
    }
    return ids;
  }

  // POI category + icon for a chamber (drives the destination picker + card).
  function poiCategory(ch) {
    const s = ((ch.label || "") + " " + (ch.pid || "") + " " + (ch.stencilId || "")).toLowerCase();
    if (/\bap\b|9179|\bmr\d|wi-?fi|access point/.test(s)) return { icon: "📶", label: "Access Point" };
    if (/\bmic|microphone/.test(s)) return { icon: "🎙", label: "Microphone" };
    if (/\bcam|camera|quad/.test(s)) return { icon: "📷", label: "Camera" };
    if (/board|room kit|room bar|roomkit|desk pro|codec|display|screen|navigator|\btouch/.test(s)) return { icon: "🖥", label: "Collaboration" };
    if (/firewall|\bfpr|\bise\b|umbrella|secure|asa/.test(s)) return { icon: "🛡", label: "Security" };
    if (/switch|920\d|930\d|940\d|950\d|core|dist|access|router|wan|sdwan|820\d|nexus|9k/.test(s)) return { icon: "🔀", label: "Network" };
    return { icon: "📍", label: "Device" };
  }

  function buildRouteOverlay(pts, destPt, destLabel) {
    const THREE = state.THREE;
    if (!THREE || !state.scene || pts.length < 2) return null;
    const g = new THREE.Group();
    const v = pts.map(p => new THREE.Vector3(p.x, 0.16, p.z));
    const curve = new THREE.CatmullRomCurve3(v, false, "catmullrom", 0.35);
    const len = curve.getLength();

    // Soft base ribbon laid on the floor.
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(24, Math.round(len * 5)), 0.2, 8, false),
      new THREE.MeshBasicMaterial({ color: 0x02c8ff, transparent: true, opacity: 0.32 })
    );
    g.add(tube);

    // Flowing chevrons that travel along the route toward the destination.
    const chevs = [];
    const nChev = Math.max(5, Math.min(48, Math.round(len / 1.6)));
    for (let i = 0; i < nChev; i++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.26, 0.7, 4),
        new THREE.MeshBasicMaterial({ color: 0x9becff, transparent: true, opacity: 0.95 })
      );
      g.add(cone);
      chevs.push(cone);
    }

    // Origin "you are here" pulse ring.
    const origin = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.66, 28),
      new THREE.MeshBasicMaterial({ color: 0x02c8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    origin.rotation.x = -Math.PI / 2;
    origin.position.set(pts[0].x, 0.12, pts[0].z);
    g.add(origin);

    // Destination: ground ring + light pillar + a floating map pin.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.09, 8, 30),
      new THREE.MeshBasicMaterial({ color: 0x2dce5c })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(destPt.x, 0.2, destPt.z);
    g.add(ring);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.14, 3.0, 12),
      new THREE.MeshBasicMaterial({ color: 0x2dce5c, transparent: true, opacity: 0.38 })
    );
    pillar.position.set(destPt.x, 1.5, destPt.z);
    g.add(pillar);
    const pin = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0x2dce5c }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 18),
      new THREE.MeshBasicMaterial({ color: 0x2dce5c }));
    tip.position.y = -0.44; tip.rotation.x = Math.PI;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xeafff3 }));
    dot.position.y = 0.05;
    pin.add(head, tip, dot);
    pin.position.set(destPt.x, 3.2, destPt.z);
    g.add(pin);

    // Maps-style white label bubble floating above the pin.
    if (destLabel) {
      const tex = makeCanvasTexture(THREE, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, 8, 8, w - 16, 56, 16); ctx.fill();
        ctx.fillStyle = "#0A1F33";
        ctx.font = "bold 27px system-ui,sans-serif";
        ctx.textAlign = "center";
        ctx.fillText((destLabel || "").slice(0, 20), w / 2, 46);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(w / 2 - 11, 63); ctx.lineTo(w / 2 + 11, 63); ctx.lineTo(w / 2, 80);
        ctx.closePath(); ctx.fill();
      }, 512, 96);
      const lmat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const label = new THREE.Sprite(lmat);
      label.scale.set(3.0, 0.56, 1);
      label.position.y = 0.95;
      label.renderOrder = 12;
      state.disposables.push(lmat);
      pin.add(label);
    }

    g.userData = { curve, chevs, ring, origin, pin, len };
    state.scene.add(g);
    return g;
  }

  function startWayfinding(destCh, fromCh) {
    if (!destCh || !state.scene) return;
    clearWayfinding();
    const from = fromCh || state.chambers[state.navIndex] || state.chambers[0];
    let legs = null;
    if (from && from.id !== destCh.id) {
      const ids = routeNodeIds(from.id, destCh.id);
      if (ids?.length) {
        legs = ids.map(id => state.chambers.find(x => x.id === id)).filter(Boolean)
          .map(c => ({ id: c.id, label: c.label, x: c.pos.x, z: c.pos.z }));
      }
    }
    if (!legs || legs.length < 2) {
      legs = [
        { id: from?.id, label: from?.label || "Start", x: from ? from.pos.x : state.pos.x, z: from ? from.pos.z : state.pos.z },
        { id: destCh.id, label: destCh.label, x: destCh.pos.x, z: destCh.pos.z }
      ];
    }
    // Anchor the route at the player's current position (the "you are here" dot)
    // so the path is drawn from where you actually stand, like real wayfinding.
    const pd = Math.hypot(state.pos.x - legs[0].x, state.pos.z - legs[0].z);
    if (pd > 0.8) legs.unshift({ id: "__you", label: "You", x: state.pos.x, z: state.pos.z });
    const pts = legs.map(l => ({ x: l.x, z: l.z }));
    const destPt = { x: destCh.pos.x, z: destCh.pos.z };
    const group = buildRouteOverlay(pts, destPt, destCh.label);
    if (!group) return;
    const startLen = Math.hypot(state.pos.x - destPt.x, state.pos.z - destPt.z) || 1;
    state.route = {
      destId: destCh.id, destLabel: destCh.label, destPt, group, points: pts,
      legs, legCursor: 1, startLen, category: poiCategory(destCh)
    };
    renderWayfindCard();
  }

  // Real wayfinding: draw a route from where the player stands and let them walk
  // it themselves with live turn-by-turn — do NOT teleport/auto-walk them there.
  function beginGuidedRoute(destCh) {
    if (!destCh) return;
    let from = state.chambers[0], best = Infinity;
    state.chambers.forEach(c => {
      const d = Math.hypot(state.pos.x - c.pos.x, state.pos.z - c.pos.z);
      if (d < best) { best = d; from = c; }
    });
    startWayfinding(destCh, from);
    setStatus(`Follow the route to ${destCh.label}`);
    window.__DS_WALK_AUDIO?.sfx?.routeStart?.();
  }

  function clearWayfinding() {
    const g = state.route?.group;
    if (g) {
      state.scene?.remove(g);
      g.traverse(o => {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach(x => x?.dispose?.());
        else m?.dispose?.();
      });
    }
    state.route = null;
    const el = document.getElementById("ds-walk-wayfind");
    if (el) el.hidden = true;
  }

  function routeRemaining() {
    if (!state.route) return 0;
    const dx = state.pos.x - state.route.destPt.x;
    const dz = state.pos.z - state.route.destPt.z;
    return Math.hypot(dx, dz);
  }

  function renderWayfindCard() {
    const el = document.getElementById("ds-walk-wayfind");
    if (!el || !state.route) return;
    const r = state.route;
    const d = routeRemaining();
    el.hidden = false;
    el.innerHTML = `<div class="ds-wf-arrow" id="ds-wf-arrow">↑</div>
      <div class="ds-wf-meta">
        <div class="ds-wf-step" id="ds-wf-step">Starting route…</div>
        <div class="ds-wf-dest">${esc(r.category?.icon || "◎")} to <b>${esc(r.destLabel)}</b>
          · <span class="ds-wf-dist" id="ds-wf-dist">${d.toFixed(0)} m</span>
          · <span class="ds-wf-eta" id="ds-wf-eta">~${Math.max(1, Math.round(d / 1.4))}s</span></div>
      </div>
      <button type="button" class="ds-wf-stop" data-action="wayfind-stop" title="Stop">✕</button>
      <div class="ds-wf-progress"><i id="ds-wf-prog" style="width:0%"></i></div>`;
  }

  function animateRoute(t) {
    const g = state.route?.group;
    if (!g?.userData) return;
    const THREE = state.THREE;
    const { curve, chevs, ring, origin, pin } = g.userData;
    const n = chevs.length || 1;
    const up = new THREE.Vector3(0, 1, 0);
    chevs.forEach((c, i) => {
      const u = ((t * 0.12) + i / n) % 1;
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u).normalize();
      c.position.copy(p);
      c.quaternion.setFromUnitVectors(up, tan);
    });
    if (ring) ring.scale.setScalar(1 + Math.sin(t * 3) * 0.14);
    if (origin) { const s = 1 + Math.sin(t * 4) * 0.18; origin.scale.set(s, s, s); }
    if (pin) pin.position.y = 3.2 + Math.sin(t * 2.5) * 0.18;
  }

  function updateWayfind() {
    if (!state.route) return;
    const r = state.route;
    const d = routeRemaining();
    const distEl = document.getElementById("ds-wf-dist");
    const etaEl = document.getElementById("ds-wf-eta");
    const stepEl = document.getElementById("ds-wf-step");
    const progEl = document.getElementById("ds-wf-prog");
    const arrowEl = document.getElementById("ds-wf-arrow");
    if (distEl) distEl.textContent = d.toFixed(0) + " m";
    if (etaEl) etaEl.textContent = "~" + Math.max(1, Math.round(d / 1.4)) + "s";
    if (progEl) progEl.style.width = Math.max(0, Math.min(100, (1 - d / r.startLen) * 100)).toFixed(0) + "%";

    // Advance the leg cursor as we reach each node along the route.
    const legs = r.legs || [];
    let cur = r.legCursor || 1;
    while (cur < legs.length - 1) {
      const dl = Math.hypot(state.pos.x - legs[cur].x, state.pos.z - legs[cur].z);
      if (dl < 2.4) cur++; else break;
    }
    r.legCursor = cur;
    const tgt = legs[cur];

    // GPS-style arrow points to the next node relative to where the player faces.
    let rel = 0;
    if (tgt) {
      const bearing = Math.atan2(tgt.x - state.pos.x, tgt.z - state.pos.z);
      rel = state.yaw - bearing;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      if (arrowEl) arrowEl.style.transform = `rotate(${rel}rad)`;
    }
    if (stepEl && tgt) {
      const dNext = Math.hypot(state.pos.x - tgt.x, state.pos.z - tgt.z);
      if (cur >= legs.length - 1) {
        stepEl.textContent = dNext < 6 ? `Arriving at ${tgt.label}` : `Head to ${tgt.label}`;
      } else {
        let side = "Continue to";
        if (Math.abs(rel) >= 2.4) side = "Turn around to";
        else if (rel > 0.5) side = "Turn right to";
        else if (rel < -0.5) side = "Turn left to";
        stepEl.textContent = `${side} ${tgt.label} · ${dNext.toFixed(0)} m`;
      }
    }

    const atDest = state.chambers[state.navIndex]?.id === r.destId;
    if (!state.fly && (atDest || d < 2.0)) {
      const label = r.destLabel;
      clearWayfinding();
      setStatus(`Arrived at ${label}`);
      const wf = document.getElementById("ds-walk-wayfind");
      if (wf) {
        wf.hidden = false;
        wf.innerHTML = `<div class="ds-wf-arrow ds-wf-done" id="ds-wf-arrow">✓</div>
          <div class="ds-wf-meta"><div class="ds-wf-step" id="ds-wf-step">You've arrived</div>
          <div class="ds-wf-dest">at <b>${esc(label)}</b></div></div>`;
        setTimeout(() => { if (!state.route) wf.hidden = true; }, 2600);
      }
    }
  }

  // ---- "Where to?" destination picker (Cisco Spaces-style) ------------------
  const WF_FILTERS = [
    { key: "all", label: "All" },
    { key: "Collaboration", label: "🖥 Rooms" },
    { key: "Access Point", label: "📶 APs" },
    { key: "Network", label: "🔀 Network" },
    { key: "AV", label: "🎙 AV" }
  ];

  function wfBucket(catLabel) {
    if (catLabel === "Microphone" || catLabel === "Camera") return "AV";
    if (catLabel === "Security") return "Network";
    return catLabel;
  }

  function openWayfindMenu() {
    let menu = document.getElementById("ds-wf-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "ds-wf-menu";
      menu.className = "ds-wf-menu";
      state.overlay?.appendChild(menu);
    }
    state.wfFilter = state.wfFilter || "all";
    menu.hidden = false;
    const chips = WF_FILTERS.map(f =>
      `<button type="button" class="ds-wf-chip${state.wfFilter === f.key ? " on" : ""}" data-chip="${f.key}">${f.label}</button>`
    ).join("");
    menu.innerHTML = `<div class="ds-wf-menu-head">
        <span class="ds-wf-menu-title">Where to?</span>
        <button type="button" class="ds-wf-menu-close" data-action="wayfind-close" title="Close">✕</button>
      </div>
      <div class="ds-wf-search-wrap">
        <span class="ds-wf-search-ico">⌕</span>
        <input type="text" class="ds-wf-search" id="ds-wf-search" placeholder="Search for a place" autocomplete="off">
      </div>
      <div class="ds-wf-chips">${chips}</div>
      <div class="ds-wf-list" id="ds-wf-list"></div>`;
    const search = menu.querySelector("#ds-wf-search");
    search?.addEventListener("input", () => renderWayfindList(search.value));
    menu.querySelectorAll("[data-chip]").forEach(c => {
      c.addEventListener("click", () => {
        state.wfFilter = c.dataset.chip;
        menu.querySelectorAll("[data-chip]").forEach(x => x.classList.toggle("on", x === c));
        renderWayfindList(search?.value || "");
      });
    });
    renderWayfindList("");
    requestAnimationFrame(() => search?.focus());
  }

  function closeWayfindMenu() {
    const menu = document.getElementById("ds-wf-menu");
    if (menu) menu.hidden = true;
    closeDestPreview();
  }

  function renderWayfindList(query) {
    const list = document.getElementById("ds-wf-list");
    if (!list) return;
    const q = (query || "").trim().toLowerCase();
    const filter = state.wfFilter || "all";
    const here = state.chambers[state.navIndex];
    const rows = state.chambers
      .filter(ch => !here || ch.id !== here.id)
      .map(ch => {
        const cat = poiCategory(ch);
        const dist = Math.hypot((here ? here.pos.x : state.pos.x) - ch.pos.x, (here ? here.pos.z : state.pos.z) - ch.pos.z);
        return { ch, cat, dist, bucket: wfBucket(cat.label) };
      })
      .filter(r => filter === "all" || r.bucket === filter)
      .filter(r => !q || (r.ch.label + " " + (r.ch.pid || "") + " " + r.cat.label).toLowerCase().includes(q))
      .sort((a, b) => a.dist - b.dist);
    if (!rows.length) { list.innerHTML = `<div class="ds-wf-empty">No matching destinations</div>`; return; }
    list.innerHTML = rows.map(r => `<button type="button" class="ds-wf-poi" data-chamber="${r.ch.id}">
      <span class="ds-wf-poi-ico">${r.cat.icon}</span>
      <span class="ds-wf-poi-main"><b>${esc(r.ch.label)}</b><i>${esc(r.cat.label)}${r.ch.pid ? " · " + esc(r.ch.pid) : ""}</i></span>
      <span class="ds-wf-poi-dist">${r.dist.toFixed(0)} m<em>›</em></span>
    </button>`).join("");
    list.querySelectorAll("[data-chamber]").forEach(btn => {
      btn.addEventListener("click", () => {
        const ch = state.chambers.find(c => c.id === btn.dataset.chamber);
        if (ch) openDestPreview(ch);
      });
    });
  }

  // Spaces-style destination preview: name, category, distance, ETA + Directions.
  function openDestPreview(ch) {
    let sheet = document.getElementById("ds-wf-preview");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "ds-wf-preview";
      sheet.className = "ds-wf-preview";
      state.overlay?.appendChild(sheet);
    }
    const cat = poiCategory(ch);
    const here = state.chambers[state.navIndex];
    const dist = Math.hypot((here ? here.pos.x : state.pos.x) - ch.pos.x, (here ? here.pos.z : state.pos.z) - ch.pos.z);
    sheet.hidden = false;
    sheet.innerHTML = `<div class="ds-wf-pv-grip"></div>
      <div class="ds-wf-pv-head">
        <span class="ds-wf-pv-ico">${cat.icon}</span>
        <div class="ds-wf-pv-meta">
          <strong>${esc(ch.label)}</strong>
          <span>${esc(cat.label)}${ch.pid ? " · " + esc(ch.pid) : ""}</span>
        </div>
        <button type="button" class="ds-wf-pv-x" data-action="preview-close" title="Close">✕</button>
      </div>
      <div class="ds-wf-pv-stats">
        <span><b>${dist.toFixed(0)}</b> m away</span>
        <span><b>~${Math.max(1, Math.round(dist / 1.4))}</b> sec walk</span>
      </div>
      <button type="button" class="ds-wf-pv-go" data-chamber="${ch.id}">➤ Directions</button>`;
    sheet.querySelector(".ds-wf-pv-go")?.addEventListener("click", () => {
      closeWayfindMenu();
      beginGuidedRoute(ch);
    });
    sheet.querySelector("[data-action='preview-close']")?.addEventListener("click", closeDestPreview);
  }

  function closeDestPreview() {
    const sheet = document.getElementById("ds-wf-preview");
    if (sheet) sheet.hidden = true;
  }

  function buildDeviceNav(chambers) {
    const bar = document.getElementById("ds-walk-devices");
    if (!bar) return;
    bar.innerHTML = chambers.map((ch, i) => {
      const theme = zoneTheme(ch.zone);
      const accent = "#" + theme.accent.toString(16).padStart(6, "0");
      return `<button type="button" class="ds-walk-dev${i === state.navIndex ? " active" : ""}" data-chamber="${ch.id}" title="${esc(ch.label)}${ch.pid ? " · " + ch.pid : ""}">
        <i style="background:${accent}"></i><span>${esc(ch.label.slice(0, 16))}</span></button>`;
    }).join("");
    bar.querySelectorAll("[data-chamber]").forEach(btn => {
      btn.addEventListener("click", () => {
        const ch = chambers.find(c => c.id === btn.dataset.chamber);
        if (!ch) return;
        teleportToChamber(ch, false);
      });
    });
  }

  function buildConnectedNav(ch) {
    const bar = document.getElementById("ds-walk-links");
    if (!bar) return;
    if (!ch || !state.topology?.segments?.length) {
      bar.innerHTML = "";
      bar.hidden = true;
      return;
    }
    const links = state.topology.segments.filter(s => s.cor.from.id === ch.id || s.cor.to.id === ch.id);
    if (!links.length) {
      bar.innerHTML = "";
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.innerHTML = `<span class="ds-walk-links-label">Connected — tap a link to walk there:</span>` + links.map(s => {
      const other = s.cor.from.id === ch.id ? s.cor.to : s.cor.from;
      const media = (s.cor.media || s.cor.label || "link").toUpperCase();
      return `<button type="button" class="ds-walk-link" data-hop="${other.id}" title="${esc(s.cor.label || media)}">
        ${esc(media)} → ${esc(other.label.slice(0, 18))}</button>`;
    }).join("");
    bar.querySelectorAll("[data-hop]").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = state.chambers.find(c => c.id === btn.dataset.hop);
        if (target) teleportToChamber(target, false);
      });
    });
  }

  function highlightNavChip(id) {
    document.querySelectorAll(".ds-walk-dev").forEach(el => {
      el.classList.toggle("active", el.dataset.chamber === id);
    });
    state.focusId = id;
    state.devicePods.forEach(pod => {
      const on = pod.userData?.chamber?.id === id;
      pod.scale.setScalar(on ? 1.04 : 1);
      if (pod.userData.ring?.material) pod.userData.ring.material.opacity = on ? 0.55 : 0.2;
    });
  }

  function minimapTeleport(mx, my, mmW, mmH) {
    if (!state.bounds || !state.chambers.length) return;
    const tX = state.bounds.minX + (mx / mmW) * (state.bounds.maxX - state.bounds.minX);
    const tZ = state.bounds.minZ + (my / mmH) * (state.bounds.maxZ - state.bounds.minZ);
    let best = null, bestD = Infinity;
    state.chambers.forEach(ch => {
      const p = chamberWorldPos(ch);
      const d = (p.x - tX) ** 2 + (p.z - tZ) ** 2;
      if (d < bestD) { bestD = d; best = ch; }
    });
    if (best) teleportToChamber(best, false);
  }

  /**
   * Push a point out of every solid device collider (circle vs circle).
   * Returns the resolved position; never leaves the player overlapping a
   * collider, so the player slides smoothly around devices instead of jamming.
   */
  function resolveCollision(x, z) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const col of state.colliders) {
        if (col.kind !== "pod") continue;
        const minDist = col.r + PLAYER_R;
        let dx = x - col.x, dz = z - col.z;
        let d2 = dx * dx + dz * dz;
        if (d2 >= minDist * minDist) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
        const push = (minDist - d) / d;
        x += dx * push;
        z += dz * push;
        moved = true;
      }
      if (!moved) break;
    }
    return { x, z };
  }

  function clampToWorld(x, z) {
    const b = state.bounds;
    if (!b) return { x, z };
    const m = 2.5;
    return {
      x: Math.max(b.minX - m, Math.min(b.maxX + m, x)),
      z: Math.max(b.minZ - m, Math.min(b.maxZ + m, z))
    };
  }

  function tryMoveCorridor(dx, dz) {
    const desired = clampToWorld(state.pos.x + dx, state.pos.z + dz);
    const resolved = resolveCollision(desired.x, desired.z);
    // Remove velocity pointing into the surface so we don't keep ramming it.
    const corrX = resolved.x - desired.x;
    const corrZ = resolved.z - desired.z;
    if (corrX || corrZ) {
      const cl = Math.hypot(corrX, corrZ) || 1;
      const nx = corrX / cl, nz = corrZ / cl;
      const into = state.vel.x * nx + state.vel.z * nz;
      if (into < 0) { state.vel.x -= into * nx; state.vel.z -= into * nz; }
    }
    state.pos.x = resolved.x;
    state.pos.z = resolved.z;
  }

  function flyEase(t) {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }

  function flyDuration(dist) {
    return Math.max(FLY_DUR_MIN, Math.min(FLY_DUR_MAX, (dist || 0) * FLY_DIST_SCALE));
  }

  function cancelMotion() {
    state.fly = null;
  }

  function updateFly(dt) {
    const f = state.fly;
    if (!f) return false;

    if (f.path?.length) {
      const idx = f.i || 0;
      const fromPt = idx === 0 ? f.from : f.path[idx - 1];
      const toPt = idx < f.path.length ? f.path[idx] : f.dest;
      const segDur = flyDuration(Math.hypot(toPt.x - fromPt.x, toPt.z - fromPt.z));
      f.t = Math.min(1, f.t + dt / segDur);
      const e = flyEase(f.t);
      state.pos.x = fromPt.x + (toPt.x - fromPt.x) * e;
      state.pos.z = fromPt.z + (toPt.z - fromPt.z) * e;
      state.pos.y = EYE_HEIGHT;
      state.yaw = Math.atan2(toPt.x - state.pos.x, toPt.z - state.pos.z);
      if (f.t >= 1) {
        f.i = idx + 1;
        f.t = 0;
        if (f.i >= f.path.length) {
          if (f.dest) state.pos = { ...f.dest };
          if (f.chamber) {
            highlightNavChip(f.chamber.id);
            buildConnectedNav(f.chamber);
            faceChamber(f.chamber);
            setStatus(`At ${f.chamber.label}${f.chamber.pid ? " · " + f.chamber.pid : ""}`);
          }
          state.fly = null;
        }
      }
      return true;
    }

    f.t = Math.min(1, f.t + dt / f.dur);
    const e = flyEase(f.t);
    state.pos.x = f.from.x + (f.to.x - f.from.x) * e;
    state.pos.y = f.from.y + (f.to.y - f.from.y) * e;
    state.pos.z = f.from.z + (f.to.z - f.from.z) * e;
    let dy = f.yawTo - f.yawFrom;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    state.yaw = f.yawFrom + dy * e;
    if (f.t >= 1) {
      if (f.chamber) {
        highlightNavChip(f.chamber.id);
        setStatus(`At ${f.chamber.label}${f.chamber.pid ? " · " + f.chamber.pid : ""}`);
      }
      state.fly = null;
    }
    return true;
  }

  function updatePlayer(dt) {
    if (updateFly(dt)) { applyCamera(); return; }
    if (window.__DS_WALK_LAYOUT_MODE?.isActive?.()) {
      state.vel.x = 0;
      state.vel.z = 0;
      applyCamera();
      return;
    }

    {
      state.vel.y = (state.vel.y ?? 0) - 30 * dt;
      state.pos.y += state.vel.y * dt;
      if (state.pos.y <= EYE_HEIGHT) {
        state.pos.y = EYE_HEIGHT;
        state.vel.y = 0;
        state.onGround = true;
      } else {
        state.onGround = false;
      }
    }

    const maxSpd = state.keys["Shift"] ? 11 : 8;
    const accel = 34;
    const friction = 10;
    // Movement basis is always relative to the camera orbit yaw (mouse-controlled).
    // Screen-right corresponds to world (-cos, +sin) for this look basis.
    const fwdX = Math.sin(state.yaw), fwdZ = Math.cos(state.yaw);
    const rightX = -Math.cos(state.yaw), rightZ = Math.sin(state.yaw);

    let ix = 0, iz = 0;
    if (state.keys["w"] || state.keys["ArrowUp"]) { ix += fwdX; iz += fwdZ; }
    if (state.keys["s"] || state.keys["ArrowDown"]) { ix -= fwdX; iz -= fwdZ; }
    if (state.keys["a"] || state.keys["ArrowLeft"]) { ix -= rightX; iz -= rightZ; }
    if (state.keys["d"] || state.keys["ArrowRight"]) { ix += rightX; iz += rightZ; }

    if (ix !== 0 || iz !== 0) {
      const len = Math.hypot(ix, iz) || 1;
      state.vel.x += (ix / len) * accel * dt;
      state.vel.z += (iz / len) * accel * dt;
      // Smoothly turn the avatar toward the direction it is moving.
      const target = Math.atan2(ix / len, iz / len);
      let d = target - state.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      state.facing += d * Math.min(1, dt * 12);
    } else {
      const damp = Math.exp(-friction * dt);
      state.vel.x *= damp;
      state.vel.z *= damp;
    }
    const spd = Math.hypot(state.vel.x, state.vel.z);
    if (spd > maxSpd) {
      state.vel.x = (state.vel.x / spd) * maxSpd;
      state.vel.z = (state.vel.z / spd) * maxSpd;
    }

    const mx = state.vel.x * dt;
    const mz = state.vel.z * dt;
    if (mx || mz) {
      tryMoveCorridor(mx, mz);
    } else {
      const safe = resolveCollision(state.pos.x, state.pos.z);
      state.pos.x = safe.x;
      state.pos.z = safe.z;
    }

    const footSpd = Math.hypot(state.vel.x, state.vel.z);
    if (footSpd > 0.3) {
      state.footPhase += dt;
      if (state.footPhase > 0.36) {
        state.footPhase = 0;
        window.__DS_WALK_AUDIO?.sfx?.footstep?.();
      }
    }
    applyCamera();
  }

  function pickReticleChamber() {
    if (!state.camera || !state.devicePods.length) return null;
    const THREE = state.THREE;
    const forward = new THREE.Vector3();
    state.camera.getWorldDirection(forward);
    let best = null, bestDot = 0.52;
    state.devicePods.forEach(pod => {
      const ch = pod.userData?.chamber;
      if (!ch) return;
      const to = new THREE.Vector3(pod.position.x - state.pos.x, 1.4 - state.pos.y, pod.position.z - state.pos.z);
      const dist = to.length();
      if (dist > 16) return;
      to.normalize();
      const dot = forward.dot(to);
      if (dot > bestDot) { bestDot = dot; best = ch; }
    });
    return best;
  }

  function openFieldPanel(ch) {
    if (!ch) return;
    window.__DS_WALK_AUDIO?.sfx?.inspect?.();
    highlightNavChip(ch.id);
    window.__DS_FIELD_PANEL?.render?.(ch, state.studio, state.graph);
    state.overlay?.classList.add("ds-field-panel-open");
    document.getElementById("ds-walk-panel-backdrop")?.removeAttribute("hidden");
  }

  function interactNearby() {
    if (window.__DS_WALK_QUEST?.isActive?.()) {
      const port = window.__DS_WALK_QUEST.reticlePick?.();
      if (port && window.__DS_WALK_QUEST.handlePick?.(port)) return;
    }
    const ch = state.reticleChamber;
    if (!ch) return;
    openFieldPanel(ch);
  }

  function updateReticleFocus() {
    const ch = pickReticleChamber();
    state.reticleChamber = ch;
    state.nearChamber = ch;
    const prompt = document.getElementById("ds-walk-prompt");
    if (prompt) {
      if (window.__DS_WALK_QUEST?.isActive?.()) {
        /* quest module updates prompt */
      } else if (ch) {
        const p = chamberWorldPos(ch);
        const near = Math.hypot(p.x - state.pos.x, p.z - state.pos.z) < 9;
        prompt.hidden = !near;
        prompt.textContent = near ? `Tap Inspect or press E — ${ch.label}` : `Walk closer to ${ch.label}`;
      } else prompt.hidden = true;
    }
    const el = document.getElementById("ds-walk-focus");
    if (el) {
      if (window.__DS_WALK_LAYOUT_MODE?.isActive?.()) {
        prompt.textContent = "Layout mode — drag a device on the floor";
      } else if (ch) {
        el.hidden = false;
        el.innerHTML = `<strong>${esc(ch.label)}</strong>${ch.pid ? `<span>${esc(ch.pid)}</span>` : ""}`;
      } else el.hidden = true;
    }
    state.devicePods.forEach(pod => {
      const pch = pod.userData?.chamber;
      if (!pch) return;
      const p = chamberWorldPos(pch);
      const dist = Math.hypot(p.x - state.pos.x, p.z - state.pos.z);
      const focused = ch?.id === pch.id;
      const showLabel = focused;
      if (pod.userData.labelSprite) {
        pod.userData.labelSprite.visible = showLabel;
        pod.userData.labelSprite.material.opacity = focused ? 1 : 0.65;
      }
      if (pod.userData.zoneBadge) pod.userData.zoneBadge.visible = focused;
      if (pod.userData.glowLight) pod.userData.glowLight.intensity = focused ? 0.28 : 0.04;
      if (pod.userData.ring) {
        pod.userData.ring.material.opacity = focused ? 0.32 : 0.06;
      }
      if (pod.userData.photoMesh?.material) {
        pod.userData.photoMesh.material.emissiveIntensity = focused ? 0.2 : 0.08;
      }
    });
  }

  function safePointerLock(el) {
    if (!el?.requestPointerLock) return;
    try {
      const p = el.requestPointerLock();
      if (p?.catch) p.catch(() => {});
    } catch (_) { /* denied or unsupported */ }
  }

  function initFieldSystems(graph) {
    state.chamberWorldPos = chamberWorldPos;
    window.__DS_FIELD_PANEL?.bindWalk?.(state);
    setStatus("Pick a device below or tap a connected link to walk your diagram");
    window.__DS_WALK_AUDIO?.start?.();
  }

  function applyCamera() {
    const cam = state.camera;
    if (!cam) return;
    const spd = Math.hypot(state.vel.x, state.vel.z);
    if (spd > 0.25) state.bobPhase += 0.016 * 9;
    const bob = spd > 0.25 ? Math.sin(state.bobPhase) * 0.038 : 0;

    if (state.thirdPerson && state.avatar) {
      const dist = 5.4;
      const camY = state.pos.y + 2.35 + bob * 0.4;
      const cx = state.pos.x - Math.sin(state.yaw) * dist;
      const cz = state.pos.z - Math.cos(state.yaw) * dist;
      cam.position.set(cx, camY, cz);
      cam.lookAt(state.pos.x, state.pos.y + 0.95, state.pos.z);
      const moving = spd > 0.25;
      const stride = moving ? Math.abs(Math.sin(state.bobPhase)) * 0.05 : 0;
      state.avatar.position.set(state.pos.x, state.pos.y - EYE_HEIGHT + stride, state.pos.z);
      state.avatar.rotation.y = state.facing;
      state.avatar.visible = true;
      animateAvatar(moving);
      if (state.viewmodel) state.viewmodel.visible = false;
    } else {
      cam.position.set(state.pos.x, state.pos.y + bob, state.pos.z);
      cam.lookAt(
        state.pos.x + Math.sin(state.yaw) * Math.cos(state.pitch),
        state.pos.y + bob + Math.sin(state.pitch),
        state.pos.z + Math.cos(state.yaw) * Math.cos(state.pitch)
      );
      if (state.avatar) state.avatar.visible = false;
      if (state.viewmodel) {
        state.viewmodel.visible = true;
        const sway = spd > 0.25 ? Math.sin(state.bobPhase * 1.2) * 0.02 : 0;
        state.viewmodel.position.set(sway, 0, 0);
      }
    }
    const compass = document.getElementById("ds-walk-compass");
    if (compass) compass.style.transform = `rotate(${-state.yaw}rad)`;
  }

  const MEDIA_LABELS = {
    cat6: "Cat6", cat6a: "Cat6a", hdmi: "HDMI", usb: "USB",
    "fiber-sm": "Fiber (SM)", "fiber-mm": "Fiber (MM)", speaker: "Speaker", control: "Control"
  };

  function populateLegend(graph) {
    const el = document.getElementById("ds-walk-legend");
    if (!el) return;
    const seen = new Map();
    (graph?.corridors || []).forEach(c => {
      const m = c.media || "cat6";
      if (!seen.has(m)) seen.set(m, MEDIA_COLORS[m] || MEDIA_COLORS.cat6);
    });
    if (!seen.size) { el.hidden = true; return; }
    el.innerHTML = `<span class="ds-walk-legend-title">Links</span>` +
      [...seen.entries()].map(([m, col]) =>
        `<span class="ds-walk-legend-item"><i style="background:#${col.toString(16).padStart(6, "0")}"></i>${MEDIA_LABELS[m] || m}</span>`
      ).join("");
    el.hidden = false;
  }

  function animateCables(t) {
    const speed = PACKET_SPEEDS[state.packetSpeedIdx]?.mult ?? 1;
    state.cables.forEach(g => {
      const curve = g.userData?.curve;
      if (!curve) return;
      g.children.forEach(ch => {
        if (!ch.userData?.packet) return;
        ch.visible = !!state.packetsEnabled;
        if (!state.packetsEnabled) return;
        ch.userData.t = (ch.userData.t + 0.006 * speed) % 1;
        const pt = curve.getPoint(ch.userData.t);
        ch.position.set(pt.x, pt.y, pt.z);
      });
    });
    state.devicePods.forEach((pod, i) => {
      const ring = pod.children.find(c => c.geometry?.type === "TorusGeometry");
      if (ring) ring.rotation.z = t * 0.4 + i;
    });
  }

  function updateFocusHud() {
    updateReticleFocus();
  }

  function worldToDiagram(wx, wz) {
    const d = state.graph?.layoutDiagram;
    if (!d?.scale) return null;
    return { x: wx / d.scale + d.cx, y: wz / d.scale + d.cy };
  }

  function drawMinimap() {
    const mm = document.getElementById("ds-walk-minimap");
    if (!mm) return;
    const ctx = mm.getContext("2d");
    const W = mm.width = 200, H = mm.height = 140;
    ctx.fillStyle = "rgba(42,92,38,0.94)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(20,40,18,0.9)";
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    ctx.font = "8px system-ui,sans-serif";
    ctx.fillStyle = "rgba(158,192,220,0.85)";
    ctx.fillText("Diagram mirror · you are here", 6, 11);

    if (!state.chambers?.length) return;

    const pad = 8;
    const rw = W - pad * 2, rh = H - pad * 2 - 8;
    const hasDiagram = state.chambers.every(ch => Number.isFinite(ch.pos?.diagramX));

    let toX, toY;
    if (hasDiagram) {
      const dxs = state.chambers.map(ch => ch.pos.diagramX);
      const dys = state.chambers.map(ch => ch.pos.diagramY);
      const minDX = Math.min(...dxs) - 20, maxDX = Math.max(...dxs) + 20;
      const minDY = Math.min(...dys) - 20, maxDY = Math.max(...dys) + 20;
      const scale = Math.min(rw / (maxDX - minDX || 1), rh / (maxDY - minDY || 1));
      const ox = pad + (rw - (maxDX - minDX) * scale) / 2;
      const oy = pad + 10 + (rh - (maxDY - minDY) * scale) / 2;
      toX = x => ox + (x - minDX) * scale;
      toY = y => oy + (y - minDY) * scale;
    } else if (state.bounds) {
      const b = state.bounds;
      const scale = Math.min(rw / (b.maxX - b.minX), rh / (b.maxZ - b.minZ));
      const ox = pad + (rw - (b.maxX - b.minX) * scale) / 2;
      const oy = pad + 10 + (rh - (b.maxZ - b.minZ) * scale) / 2;
      toX = x => ox + (x - b.minX) * scale;
      toY = z => oy + (z - b.minZ) * scale;
    } else return;

    const corridors = state.graph?.corridors || [];
    corridors.forEach(cor => {
      const a = cor.from.pos, b = cor.to.pos;
      const ax = hasDiagram ? a.diagramX : a.x;
      const ay = hasDiagram ? a.diagramY : a.z;
      const bx = hasDiagram ? b.diagramX : b.x;
      const by = hasDiagram ? b.diagramY : b.z;
      if (![ax, ay, bx, by].every(Number.isFinite)) return;
      const col = cor.color ?? 0xd4a060;
      ctx.strokeStyle = "#" + col.toString(16).padStart(6, "0");
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = cor.media === "hdmi" || cor.media === "usb" ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(toX(ax), toY(ay));
      ctx.lineTo(toX(bx), toY(by));
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    state.chambers.forEach(ch => {
      const px = hasDiagram ? ch.pos.diagramX : ch.pos.x;
      const py = hasDiagram ? ch.pos.diagramY : ch.pos.z;
      if (!Number.isFinite(px) || !Number.isFinite(py)) return;
      const theme = zoneTheme(ch.zone);
      const active = ch.id === state.focusId;
      ctx.fillStyle = "#" + theme.accent.toString(16).padStart(6, "0");
      ctx.beginPath();
      ctx.arc(toX(px), toY(py), active ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    if (state.route?.points?.length) {
      const mapPt = p => {
        if (hasDiagram) { const dd = worldToDiagram(p.x, p.z); return dd ? { x: toX(dd.x), y: toY(dd.y) } : null; }
        return { x: toX(p.x), y: toY(p.z) };
      };
      ctx.strokeStyle = "#02c8ff";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      let started = false;
      state.route.points.forEach(p => {
        const m = mapPt(p);
        if (!m || !Number.isFinite(m.x)) return;
        if (started) ctx.lineTo(m.x, m.y); else { ctx.moveTo(m.x, m.y); started = true; }
      });
      ctx.stroke();
      const dm = mapPt(state.route.destPt);
      if (dm && Number.isFinite(dm.x)) {
        ctx.strokeStyle = "#2dce5c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dm.x, dm.y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const diag = worldToDiagram(state.pos.x, state.pos.z);
    let plx, ply;
    if (diag && hasDiagram) {
      plx = toX(diag.x);
      ply = toY(diag.y);
    } else {
      plx = toX(state.pos.x);
      ply = toY(state.pos.z);
    }
    drawMinimapPlayer(ctx, plx, ply);
  }

  function drawMinimapPlayer(ctx, px, py) {
    // Google-Maps / Cisco Spaces style "blue dot": heading cone, accuracy halo,
    // and a white-ringed solid blue dot.
    const yaw = state.yaw;
    ctx.save();
    // Heading beam.
    const grad = ctx.createRadialGradient(px, py, 2, px, py, 22);
    grad.addColorStop(0, "rgba(2,200,255,0.5)");
    grad.addColorStop(1, "rgba(2,200,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, 22, (Math.PI / 2 - yaw) - 0.5, (Math.PI / 2 - yaw) + 0.5);
    ctx.closePath();
    ctx.fill();
    // Accuracy halo.
    ctx.fillStyle = "rgba(2,200,255,0.16)";
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fill();
    // Solid dot with white ring.
    ctx.fillStyle = "#0A60FF";
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function animateDust(dt) {
    const pts = state.dustParticles;
    if (!pts?.geometry?.attributes?.position) return;
    const arr = pts.geometry.attributes.position.array;
    for (let i = 0; i < arr.length / 3; i++) {
      arr[i * 3 + 1] += dt * (0.12 + (i % 7) * 0.015);
      if (arr[i * 3 + 1] > 9.5) arr[i * 3 + 1] = 0.6 + Math.random() * 0.5;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.rotation.y += dt * 0.015;
  }

  function loop(now) {
    if (!state.renderer || !state.scene || !state.camera) return;
    const t = (now || performance.now()) / 1000;
    const dt = Math.min(0.05, state.lastFrame ? t - state.lastFrame : 0.016);
    state.lastFrame = t;
    state.clock += dt;
    updatePlayer(dt);
    animateCables(state.clock);
    animateRoleEffects(state.clock);
    window.__DS_WALK_QUEST?.tick?.(state.clock);
    animateDust(dt);
    updateReticleFocus();
    if (state.route) { animateRoute(state.clock); updateWayfind(); }
    if (state.outcomes) {
      animateOutcomes(state.clock);
      if (state.clock - (state._outcomeT || 0) > 0.5) { state._outcomeT = state.clock; renderOutcomeReadout(); }
    }
    // Minimap is canvas-2D and relatively costly; 15fps is plenty for a map.
    if (state.clock - (state._miniT || 0) > 0.066) { state._miniT = state.clock; drawMinimap(); }
    adaptQuality(dt);
    state.renderer.render(state.scene, state.camera);
    state.animId = requestAnimationFrame(loop);
  }

  // One-way quality gate: if sustained FPS is low (AA + shadows + 2x DPR can be
  // heavy on integrated GPUs), drop to 1x pixel ratio once to recover smoothness.
  function adaptQuality(dt) {
    const s = state;
    s._fpsAcc = (s._fpsAcc || 0) + dt;
    s._fpsN = (s._fpsN || 0) + 1;
    if (s._fpsAcc < 1.5) return;
    const fps = s._fpsN / s._fpsAcc;
    s._fpsAcc = 0; s._fpsN = 0;
    if (!s._qualityDropped && fps < 38 && s.renderer && s.renderer.getPixelRatio() > 1) {
      s._qualityDropped = true;
      s.renderer.setPixelRatio(1);
      resizeRenderer();
    }
  }

  // ---- Cisco Spaces outcome overlay ---------------------------------------
  // Turns the walk into a live "what this space does" demo: occupancy heat field,
  // wandering people, Detect-and-Locate + IoT cards floating over the real devices.
  function outcomeStats() {
    const chambers = state.chambers || [];
    const cat = c => poiCategory(c)?.label;
    const aps = chambers.filter(c => cat(c) === "Access Point");
    const mics = chambers.filter(c => cat(c) === "Microphone");
    const collab = chambers.filter(c => cat(c) === "Collaboration");
    let seats = 0;
    const room = state.studio?.design?.rooms?.find(r => r.id === state.studio.activeRoomId);
    const m = String(room?.name || room?.template || "").match(/(\d+)\D+(\d+)?\s*seat/i);
    if (m) seats = m[2] ? Math.round((+m[1] + +m[2]) / 2) : +m[1];
    if (!seats) seats = Math.max(6, collab.length * 4 || chambers.length || 10);
    return { seats, aps, mics, collab, deviceCount: chambers.length };
  }

  function makeOutcomeCard(THREE, title, value, sub, accent) {
    const tex = makeCanvasTexture(THREE, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(8,20,34,0.92)";
      roundRect(ctx, 6, 6, w - 12, h - 12, 22); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = accent;
      ctx.font = "bold 22px system-ui,sans-serif"; ctx.textAlign = "left";
      ctx.fillText(title.toUpperCase().slice(0, 22), 26, 40);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 58px system-ui,sans-serif";
      ctx.fillText(value, 26, 108);
      if (sub) { ctx.fillStyle = "#9fc6e8"; ctx.font = "22px system-ui,sans-serif"; ctx.fillText(sub.slice(0, 28), 26, 144); }
    }, 360, 172);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 20;
    state.disposables.push(mat);
    return sp;
  }

  function buildOutcomeOverlay(THREE) {
    if (!THREE || !state.scene || !state.bounds) return;
    const b = state.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const radius = Math.max(6, Math.min(b.maxX - b.minX, b.maxZ - b.minZ) * 0.5 + 2);
    const st = outcomeStats();
    const g = new THREE.Group();
    g.userData.noShadow = true;

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      new THREE.MeshBasicMaterial({ color: 0x16b35a, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    disc.rotation.x = -Math.PI / 2; disc.position.set(cx, 0.06, cz);
    g.add(disc); g.userData.disc = disc;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.93, radius, 48),
      new THREE.MeshBasicMaterial({ color: 0x44e08c, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.07, cz);
    g.add(ring); g.userData.ring = ring;

    const people = [];
    const n = Math.max(3, Math.round(st.seats * 0.55));
    for (let i = 0; i < n; i++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), new THREE.MeshBasicMaterial({ color: 0x02c8ff, transparent: true, opacity: 0.82 }));
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 18), new THREE.MeshBasicMaterial({ color: 0x02c8ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = -0.8; dot.add(halo);
      g.add(dot);
      people.push({ mesh: dot, ang0: Math.random() * Math.PI * 2, baseR: (0.25 + Math.random() * 0.6) * radius, speed: 0.15 + Math.random() * 0.35, phase: Math.random() * 6 });
    }
    g.userData.people = people;

    const central = makeOutcomeCard(THREE, "Live Occupancy", "55%", `${n} of ${st.seats} seats`, "#16b35a");
    central.position.set(cx, 3.4, cz); central.scale.set(3.8, 1.8, 1);
    g.add(central); g.userData.central = central;

    st.aps.slice(0, 3).forEach((ap, i) => {
      const card = makeOutcomeCard(THREE, "Detect & Locate", String(n + 2 + i * 2), "Wi-Fi clients located", "#0A60FF");
      const p = chamberWorldPos(ap); card.position.set(p.x, 2.7, p.z); card.scale.set(3.0, 1.45, 1);
      g.add(card);
    });
    const envHost = st.mics[0] || st.collab[0];
    if (envHost) {
      const card = makeOutcomeCard(THREE, "Environment", "23°C", "CO₂ 540ppm · 41% RH", "#6F42C1");
      const p = chamberWorldPos(envHost); card.position.set(p.x, 2.7, p.z); card.scale.set(3.0, 1.45, 1);
      g.add(card);
    }

    state.scene.add(g);
    state.outcomeGroup = g;
    state.outcomeStats = st;
  }

  function removeOutcomeOverlay() {
    const g = state.outcomeGroup;
    if (!g) return;
    state.scene?.remove(g);
    g.traverse(o => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach(x => x?.dispose?.()); else m?.dispose?.();
    });
    state.outcomeGroup = null;
  }

  function animateOutcomes(t) {
    const g = state.outcomeGroup;
    if (!g) return;
    const b = state.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
    const occ = 0.55 + 0.12 * Math.sin(t * 0.4);
    if (g.userData.ring) { g.userData.ring.material.opacity = 0.3 + 0.3 * pulse; g.userData.ring.scale.setScalar(1 + 0.02 * pulse); }
    if (g.userData.disc) {
      g.userData.disc.material.opacity = 0.10 + 0.06 * pulse;
      g.userData.disc.material.color.setHSL(0.33 - occ * 0.18, 0.7, 0.45); // green→amber as it fills
    }
    (g.userData.people || []).forEach(p => {
      const ang = p.ang0 + t * p.speed * 0.3;
      const r = p.baseR + Math.sin(t * 0.5 + p.phase) * 0.7;
      p.mesh.position.set(cx + Math.cos(ang) * r, 0.9 + Math.sin(t * 2 + p.phase) * 0.05, cz + Math.sin(ang) * r);
    });
    if (g.userData.central) g.userData.central.position.y = 3.4 + Math.sin(t * 0.8) * 0.08;
  }

  function insightsUserDismissed() {
    try { return sessionStorage.getItem(WALK_INSIGHTS_OFF_KEY) === "1"; } catch (e) { return false; }
  }

  function syncOutcomesHud() {
    const btn = state.overlay?.querySelector('[data-action="outcomes"]');
    const panel = document.getElementById("ds-walk-outcomes");
    if (!btn) return;
    if (state.outcomes) {
      btn.classList.add("active");
      btn.textContent = "Insights: on";
      panel?.removeAttribute("hidden");
    } else {
      btn.classList.remove("active");
      btn.textContent = "Insights";
      panel?.setAttribute("hidden", "");
    }
  }

  function toggleOutcomes() {
    if (state.graph?.kind !== "room") {
      setStatus("Insights overlay is available in room walk only");
      return;
    }
    state.outcomes = !state.outcomes;
    if (state.outcomes) {
      try { sessionStorage.removeItem(WALK_INSIGHTS_OFF_KEY); } catch (e) { /* ignore */ }
      if (!state.outcomeGroup) buildOutcomeOverlay(state.THREE);
      renderOutcomeReadout();
      setStatus("Simulated occupancy, Detect & Locate, IoT");
    } else {
      try { sessionStorage.setItem(WALK_INSIGHTS_OFF_KEY, "1"); } catch (e) { /* ignore */ }
      removeOutcomeOverlay();
      setStatus("Insights off");
    }
    syncOutcomesHud();
  }

  function layerFilterHtml(tab) {
    if (tab !== "network") return "";
    const chips = NET_LAYER_FILTERS.map(f =>
      `<button type="button" class="ds-walk-layer${f.key === "all" ? " active" : ""}" data-layer="${f.key}">${f.label}</button>`
    ).join("");
    return `<div class="ds-walk-layer-filters" id="ds-walk-layer-filters" aria-label="Filter Prev/Next by layer">${chips}</div>`;
  }

  function showWalkOnboardHint() {
    let seen = true;
    try { seen = localStorage.getItem(WALK_ONBOARD_KEY) === "1"; } catch (e) { /* ignore */ }
    if (seen || !state.overlay) return;
    try { localStorage.setItem(WALK_ONBOARD_KEY, "1"); } catch (e) { /* ignore */ }
    const el = document.createElement("div");
    el.className = "ds-walk-onboard";
    el.innerHTML = `<strong>3D walk controls</strong>
      <p>Drag to look · <kbd>WASD</kbd> move · Tap a <em>connected link</em> or use ‹ Prev / Next › · <kbd>E</kbd> inspect · <kbd>Esc</kbd> back to diagram</p>`;
    state.overlay.appendChild(el);
    setTimeout(() => el.classList.add("ds-walk-onboard-out"), 4800);
    setTimeout(() => el.remove(), 5600);
  }

  function renderOutcomeReadout() {
    const el = document.getElementById("ds-walk-outcomes");
    if (!el || !state.outcomeStats) return;
    const st = state.outcomeStats, t = state.clock;
    const occ = Math.round((0.55 + 0.12 * Math.sin(t * 0.4)) * 100);
    const people = Math.max(0, Math.round(st.seats * occ / 100));
    const clients = people + st.deviceCount + 2;
    el.innerHTML = `<div class="ds-oc-head">LIVE INSIGHTS · SIMULATION</div>
      <div class="ds-oc-row"><span class="ds-oc-dot" style="background:#16b35a"></span><strong>${occ}%</strong> occupancy · ${people}/${st.seats} seats</div>
      <div class="ds-oc-row"><span class="ds-oc-dot" style="background:#0A60FF"></span>Detect &amp; Locate · ${clients} Wi-Fi clients</div>
      <div class="ds-oc-row"><span class="ds-oc-dot" style="background:#6F42C1"></span>IoT · 23°C · CO₂ 540ppm${st.mics.length ? ` · ${st.mics.length} mic${st.mics.length > 1 ? "s" : ""}` : ""}</div>`;
  }

  function loadPacketPrefs() {
    try {
      const raw = sessionStorage.getItem(WALK_PACKETS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p.enabled === "boolean") state.packetsEnabled = p.enabled;
      if (Number.isFinite(p.speedIdx)) {
        state.packetSpeedIdx = Math.max(0, Math.min(PACKET_SPEEDS.length - 1, p.speedIdx | 0));
      }
    } catch (e) { /* ignore */ }
  }

  function savePacketPrefs() {
    try {
      sessionStorage.setItem(WALK_PACKETS_KEY, JSON.stringify({
        enabled: !!state.packetsEnabled,
        speedIdx: state.packetSpeedIdx
      }));
    } catch (e) { /* ignore */ }
  }

  function applyPacketVisibility() {
    state.cables.forEach(g => {
      g.children.forEach(ch => {
        if (ch.userData?.packet) ch.visible = !!state.packetsEnabled;
      });
    });
  }

  function syncPacketsHud() {
    const btn = state.overlay?.querySelector('[data-action="packets"]');
    const spd = state.overlay?.querySelector('[data-action="packet-speed"]');
    const preset = PACKET_SPEEDS[state.packetSpeedIdx] || PACKET_SPEEDS[1];
    if (btn) {
      btn.classList.toggle("active", !!state.packetsEnabled);
      btn.textContent = state.packetsEnabled ? "Packets: on" : "Packets";
    }
    if (spd) {
      spd.textContent = preset.label;
      spd.disabled = !state.packetsEnabled;
      spd.title = state.packetsEnabled
        ? `Packet speed — ${preset.label} (click to change)`
        : "Turn packets on to change speed";
    }
  }

  function togglePackets() {
    state.packetsEnabled = !state.packetsEnabled;
    applyPacketVisibility();
    savePacketPrefs();
    syncPacketsHud();
    setStatus(state.packetsEnabled
      ? `Link packets on · ${PACKET_SPEEDS[state.packetSpeedIdx]?.label || "Normal"} speed`
      : "Link packets off — cables stay visible");
  }

  function cyclePacketSpeed() {
    if (!state.packetsEnabled) return;
    state.packetSpeedIdx = (state.packetSpeedIdx + 1) % PACKET_SPEEDS.length;
    savePacketPrefs();
    syncPacketsHud();
    setStatus(`Packet speed · ${PACKET_SPEEDS[state.packetSpeedIdx].label}`);
  }

  function hudHtml(tab) {
    const outcomesBtn = tab === "room"
      ? `<button type="button" class="ds-walk-btn ds-walk-btn-spaces" data-action="outcomes" title="Simulated occupancy, location &amp; IoT overlay — room walks only">Insights</button>`
      : "";
    const questBtn = tab === "room"
      ? `<button type="button" class="ds-walk-btn ds-walk-btn-quest" data-action="cable-quest" title="Mini-game: connect Room Bar or ceiling mic to the PoE switch">Cable Quest</button>`
      : "";
    return `<div class="ds-walk-hud">
      <div class="ds-walk-hud-top">
        <strong class="ds-walk-title">3D WALKTHROUGH</strong>
        <span class="ds-walk-hint">WASD move · G layout · E inspect · Esc exit</span>
        <button type="button" class="ds-walk-close" title="Exit walkthrough">✕</button>
      </div>
      <div class="ds-walk-hud-mid">
        <button type="button" class="ds-walk-btn" data-action="prev-dev" title="Previous device">‹ Prev</button>
        <button type="button" class="ds-walk-btn" data-action="next-dev" title="Next device">Next ›</button>
        ${questBtn}
        ${outcomesBtn}
        <button type="button" class="ds-walk-btn ds-walk-pkt-toggle" data-action="packets" title="Show or hide data packets on links">Packets</button>
        <button type="button" class="ds-walk-btn ds-walk-pkt-speed" data-action="packet-speed" title="Packet speed">Normal</button>
        <button type="button" class="ds-walk-btn ds-walk-btn-layout" data-action="layout-toggle" title="Drag devices on the floor — syncs to diagram">Layout</button>
        <button type="button" class="ds-walk-btn primary" data-action="inspect" title="Open device details">Inspect</button>
      </div>
      ${layerFilterHtml(tab)}
      <div class="ds-walk-outcomes" id="ds-walk-outcomes" hidden></div>
      <div class="ds-walk-quest" id="ds-walk-quest" hidden>
        <div class="ds-walk-quest-head">
          <strong id="ds-walk-quest-title">Cable Quest</strong>
          <button type="button" class="ds-walk-quest-x" data-action="cable-quest-cancel" title="Cancel quest">✕</button>
        </div>
        <p id="ds-walk-quest-step" class="ds-walk-quest-step"></p>
      </div>
      <div class="ds-walk-wayfind" id="ds-walk-wayfind" hidden></div>
      <div class="ds-walk-links" id="ds-walk-links" hidden></div>
      <div class="ds-walk-legend" id="ds-walk-legend" hidden></div>
      <div class="ds-walk-focus" id="ds-walk-focus" hidden></div>
      <div class="ds-walk-status" id="ds-walk-status">Follow a connected link below, or use ‹ Prev / Next ›</div>
    </div>`;
  }

  // The device hotbar lives as a direct child of the overlay (not inside the
  // compact, absolutely-positioned top bar) so it anchors to the bottom-center
  // of the full screen instead of floating over the HUD.
  function hudPanelsHtml() {
    return `<button type="button" class="ds-wf-fab" data-action="wayfind-open" title="Where to? — get directions">
        <span class="ds-wf-fab-ico">◎</span><span class="ds-wf-fab-txt">Where to?</span>
      </button>
      <div class="ds-walk-devices" id="ds-walk-devices"></div>`;
  }

  function bindDpad() {
    const map = { fwd: "w", back: "s", left: "a", right: "d" };
    state.overlay?.querySelectorAll("[data-move]").forEach(btn => {
      const key = map[btn.dataset.move];
      if (!key) return;
      const down = e => { e.preventDefault(); cancelMotion(); state.keys[key] = true; };
      const up = () => { state.keys[key] = false; };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointerleave", up);
      btn.addEventListener("pointercancel", up);
    });
  }

  function bindHud() {
    bindDpad();
    state.overlay?.querySelector(".ds-walk-close")?.addEventListener("click", () => close());
    state.overlay?.addEventListener("click", e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === "outcomes") { e.preventDefault(); e.stopPropagation(); toggleOutcomes(); }
      else if (a === "packets") { e.preventDefault(); e.stopPropagation(); togglePackets(); }
      else if (a === "packet-speed") { e.preventDefault(); e.stopPropagation(); cyclePacketSpeed(); }
      else if (a === "wayfind-open") openWayfindMenu();
      else if (a === "wayfind-close") closeWayfindMenu();
      else if (a === "wayfind-stop") { clearWayfinding(); setStatus("Wayfinding stopped"); }
      else if (a === "prev-dev") cycleDevice(-1);
      else if (a === "next-dev") cycleDevice(1);
      else if (a === "inspect") interactNearby();
      else if (a === "cable-quest") {
        e.preventDefault();
        e.stopPropagation();
        window.__DS_WALK_QUEST?.start?.(state.studio);
      }
      else if (a === "cable-quest-cancel") {
        e.preventDefault();
        e.stopPropagation();
        window.__DS_WALK_QUEST?.end?.(false);
      }
      else if (a === "layout-toggle") {
        e.preventDefault();
        e.stopPropagation();
        window.__DS_WALK_LAYOUT_MODE?.toggle?.();
      }
      else if (a === "fp-close") window.__DS_FIELD_PANEL?.close?.();
      else if (a === "fp-fly") {
        const id = document.getElementById("ds-field-panel")?.dataset?.chamberId;
        const ch = state.chambers.find(c => c.id === id);
        if (ch) teleportToChamber(ch, false);
      }
    });
    state.overlay?.querySelectorAll("[data-layer]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.layerFilter = btn.dataset.layer || "all";
        state.overlay.querySelectorAll("[data-layer]").forEach(b =>
          b.classList.toggle("active", b === btn));
        const label = NET_LAYER_FILTERS.find(f => f.key === state.layerFilter)?.label || "All";
        setStatus(`Layer ${label} — ‹ Prev / Next › walks this layer only`);
      });
    });
  }

  function setStatus(msg) {
    const el = document.getElementById("ds-walk-status");
    if (el) { el.textContent = msg; el.classList.remove("ds-walk-error"); }
  }

  function chamberWorldPos(ch) {
    return ch.pos;
  }

  function pickDeviceAt(clientX, clientY, canvas) {
    if (!state.raycaster || !state.camera) return null;
    const rect = canvas.getBoundingClientRect();
    const ndc = new state.THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    state.raycaster.setFromCamera(ndc, state.camera);
    const hits = state.raycaster.intersectObjects(state.devicePods, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData?.chamber) o = o.parent;
      if (o?.userData?.chamber) return o.userData.chamber;
    }
    return null;
  }

  function bindInput(canvas) {
    const onKey = e => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      state.keys[k] = e.type === "keydown";
      if (e.type === "keydown") {
        if (MOVE_KEYS.has(e.key)) cancelMotion();
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (window.__DS_WALK_LAYOUT_MODE?.onKeyDown?.(e)) return;
          if (window.__DS_WALK_QUEST?.isActive?.()) {
            window.__DS_WALK_QUEST.end(false);
            return;
          }
          const panel = document.getElementById("ds-field-panel");
          if (panel && !panel.hidden) {
            window.__DS_FIELD_PANEL?.close?.();
            return;
          }
          close();
          return;
        }
        if (e.key === "[" || e.key === "{") { e.preventDefault(); cycleDevice(-1); return; }
        if (e.key === "]" || e.key === "}") { e.preventDefault(); cycleDevice(1); return; }
        if (e.key === "Tab") { e.preventDefault(); cycleDevice(e.shiftKey ? -1 : 1); return; }
        if (e.key === "e" || e.key === "E") { e.preventDefault(); interactNearby(); return; }
        if (e.key === "g" || e.key === "G") {
          e.preventDefault();
          window.__DS_WALK_LAYOUT_MODE?.toggle?.();
          return;
        }
        if (e.code === "Space" && !state.fly) {
          e.preventDefault();
          if (state.onGround) {
            state.vel.y = 10.5;
            state.onGround = false;
          }
          return;
        }
        if (e.key === "v" || e.key === "V") { e.preventDefault(); toggleCameraMode(); return; }
      }
    };
    const onLook = (dx, dy) => {
      state.yaw += dx * 0.003;
      state.pitch = Math.max(-0.55, Math.min(0.55, state.pitch - dy * 0.003));
    };
    let downPos = null;
    const onDown = e => {
      if (e.button !== 0 && e.button !== 2) return;
      const mm = e.target.closest("#ds-walk-minimap");
      if (mm) {
        const r = mm.getBoundingClientRect();
        const scaleX = mm.width / r.width;
        const scaleY = mm.height / r.height;
        minimapTeleport((e.clientX - r.left) * scaleX, (e.clientY - r.top) * scaleY, mm.width, mm.height);
        return;
      }
      if (!canvas.contains(e.target) && e.target !== canvas) return;
      if (window.__DS_WALK_LAYOUT_MODE?.handleDown?.(e, canvas, pickDeviceAt)) return;
      window.__DS_WALK_AUDIO?.start?.();
      state.lookDrag = true;
      downPos = { x: e.clientX, y: e.clientY };
      state.lookLast = { x: e.clientX, y: e.clientY };
    };
    const onMove = e => {
      if (window.__DS_WALK_LAYOUT_MODE?.handleMove?.(e, canvas)) return;
      if (state.pointerLocked) {
        onLook(e.movementX, e.movementY);
        return;
      }
      if (!state.lookDrag) return;
      onLook(e.clientX - state.lookLast.x, e.clientY - state.lookLast.y);
      state.lookLast = { x: e.clientX, y: e.clientY };
    };
    const onUp = e => {
      if (window.__DS_WALK_LAYOUT_MODE?.handleUp?.()) {
        state.lookDrag = false;
        downPos = null;
        return;
      }
      if (e.button === 0 && downPos) {
        const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        if (moved < 6) {
          if (window.__DS_WALK_LAYOUT_MODE?.isActive?.()) {
            state.lookDrag = false;
            downPos = null;
            return;
          }
          if (window.__DS_WALK_QUEST?.isActive?.()) {
            const port = window.__DS_WALK_QUEST.pickAt?.(e.clientX, e.clientY, canvas);
            if (port && window.__DS_WALK_QUEST.handlePick?.(port)) return;
          }
          const ch = pickDeviceAt(e.clientX, e.clientY, canvas) || state.reticleChamber;
          if (ch && !window.__DS_WALK_QUEST?.isActive?.()) openFieldPanel(ch);
          else if (state.overlay?.classList.contains("ds-field-panel-open"))
            window.__DS_FIELD_PANEL?.close?.();
        }
      }
      state.lookDrag = false;
      downPos = null;
    };
    const onDbl = () => safePointerLock(canvas);
    const onWheel = e => {
      if (!canvas.matches(":hover")) return;
      e.preventDefault();
      const boost = e.deltaY < 0 ? 1.12 : 0.9;
      state.vel.x *= boost;
      state.vel.z *= boost;
    };
    const onLock = () => {
      state.pointerLocked = document.pointerLockElement === canvas;
      state.overlay?.classList.toggle("ds-walk-locked", state.pointerLocked);
    };
    const onStencilDragOver = e => {
      if (!e.dataTransfer?.types?.includes("text/stencil")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };
    const onStencilDrop = e => {
      const id = e.dataTransfer?.getData?.("text/stencil");
      if (!id || !state.studio) return;
      e.preventDefault();
      const hit = window.__DS_WALK_LAYOUT_MODE?.floorHit?.(e.clientX, e.clientY, canvas);
      if (hit) state.studio.addStencilFromWalk?.(id, hit.x, hit.z);
      else state.studio.addStencil(id);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("dblclick", onDbl);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dragover", onStencilDragOver);
    canvas.addEventListener("drop", onStencilDrop);
    document.addEventListener("pointerlockchange", onLock);
    state._inputCleanup = () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("dblclick", onDbl);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dragover", onStencilDragOver);
      canvas.removeEventListener("drop", onStencilDrop);
      document.removeEventListener("pointerlockchange", onLock);
      document.exitPointerLock?.();
    };
  }

  function showWalkError(msg) {
    const status = document.getElementById("ds-walk-status");
    if (status) { status.textContent = msg; status.classList.add("ds-walk-error"); }
  }

  function disposeScene() {
    clearWayfinding();
    removeOutcomeOverlay();
    state.outcomes = false;
    state.outcomeStats = null;
    syncOutcomesHud();
    state._qualityDropped = false;
    state._fpsAcc = 0; state._fpsN = 0; state._miniT = 0; state._outcomeT = 0;
    if (state.envRT) { state.envRT.dispose?.(); state.envRT = null; }
    if (state.scene) state.scene.environment = null;
    if (state.viewmodel && state.camera) state.camera.remove(state.viewmodel);
    if (state.avatar && state.scene) state.scene.remove(state.avatar);
    state.viewmodel = null;
    state.avatar = null;
    state.disposables.forEach(d => d.dispose?.());
    state.disposables = [];
    state.texCache.clear();
    state.devicePods = [];
    state.cables = [];
    state.colliders = [];
    state.bounds = null;
    state.fly = null;
    state.vel = { x: 0, y: 0, z: 0 };
    state.lastFrame = 0;
    state.dustParticles = null;
    if (state.scene) {
      state.scene.traverse(obj => {
        obj.geometry?.dispose?.();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach(x => x?.dispose?.());
        else m?.dispose?.();
      });
    }
    state.renderer?.dispose?.();
    state.renderer = null;
    state.scene = null;
    state.camera = null;
    state.topology = null;
    state.graph = null;
    window.__DS_WALK_QUEST?.end?.(false);
  }

  async function open(studio) {
    if (!studio || (studio.tab !== "room" && studio.tab !== "network")) {
      studio?.toast?.("Open Network or Room tab first");
      return;
    }
    const graph = buildGraph(studio);
    if (!graph?.chambers.length) {
      studio.toast?.(studio.tab === "room" ? "Add a room template with devices first" : "Add network devices first");
      return;
    }

    if (state.mode) close(true);
    state.studio = studio;
    state.mode = "walk";

    let overlay = document.getElementById("ds-walk-overlay");
    const wrap = document.getElementById("ds-canvas-wrap");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "ds-walk-overlay";
      wrap?.appendChild(overlay);
    } else if (wrap) wrap.appendChild(overlay);

    state.overlay = overlay;
    overlay.hidden = false;
    overlay.removeAttribute("hidden");
    overlay.setAttribute("aria-hidden", "false");
    overlay.className = "ds-walk-overlay ds-walk-tour";
    overlay.innerHTML = `${hudHtml(studio.tab)}
      <div class="ds-walk-stage">
        <div class="ds-walk-panel-backdrop" id="ds-walk-panel-backdrop" hidden data-action="fp-close" title="Click to keep walking" aria-label="Close panel"></div>
        <div class="ds-walk-crosshair ds-walk-crosshair-plus" aria-hidden="true"></div>
        <div class="ds-walk-prompt" id="ds-walk-prompt" hidden>Press E to inspect</div>
        <div class="ds-walk-compass" id="ds-walk-compass" aria-hidden="true"><span>N</span></div>
        <canvas id="ds-walk-minimap" class="ds-walk-minimap" title="Click a device to jump there"></canvas>
        <div class="ds-walk-dpad" id="ds-walk-dpad" aria-label="Move">
          <button type="button" class="ds-walk-dpad-btn" data-move="fwd" aria-label="Forward">▲</button>
          <button type="button" class="ds-walk-dpad-btn ds-walk-dpad-mid" data-move="left" aria-label="Left">◀</button>
          <button type="button" class="ds-walk-dpad-btn ds-walk-dpad-mid" data-move="right" aria-label="Right">▶</button>
          <button type="button" class="ds-walk-dpad-btn" data-move="back" aria-label="Back">▼</button>
        </div>
        <div class="ds-walk-canvas-wrap">
          <canvas id="ds-walk-canvas"></canvas>
        </div>
        <aside class="ds-field-panel" id="ds-field-panel" hidden aria-label="Device inspect"></aside>
      </div>
      ${hudPanelsHtml()}`;
    bindHud();
    loadPacketPrefs();
    applyPacketVisibility();
    syncOutcomesHud();
    syncPacketsHud();

    const canvas = overlay.querySelector("#ds-walk-canvas");
    bindInput(canvas);
    setStatus("Loading walkthrough…");
    await waitForCanvasSize(canvas);

    try {
      state.overlay?.classList.add("ds-walk-loading");
      await initCorridor(studio, canvas, graph);
      initFieldSystems(graph);
      loop();
      state.overlay?.classList.remove("ds-walk-loading");
      state.overlay?.classList.remove("ds-walk-fade-out");
      state.overlay?.classList.add("ds-walk-fade-in");
      requestAnimationFrame(() => state.overlay?.classList.remove("ds-walk-fade-in"));
      studio.roomView = "walk";
      window.__DS_PREMIUM?.renderRoomViewToggle?.(studio);
      setStatus("Pick a device below or tap a connected link to walk your diagram");
    } catch (err) {
      console.error("[DS Walk]", err);
      showWalkError(err?.message === "three-load" ? "3D library failed to load — hard-refresh" : `Walkthrough failed: ${err.message}`);
      studio.toast?.("Walkthrough failed — see overlay message");
    }

    state._resize = () => resizeRenderer();
    window.addEventListener("resize", state._resize);
  }

  async function rebuild(studio) {
    if (!state.mode || !studio) return;
    if (studio.tab !== "room" && studio.tab !== "network") return;
    const graph = buildGraph(studio);
    if (!graph?.chambers.length) {
      setStatus(studio.tab === "room" ? "No room devices to walk" : "No network devices to walk");
      return;
    }
    const canvas = state.overlay?.querySelector("#ds-walk-canvas");
    if (!canvas) return;
    window.__DS_FIELD_PANEL?.close?.();
    cancelAnimationFrame(state.animId);
    state.animId = 0;
    disposeScene();
    state.studio = studio;
    state.mode = "walk";
    try {
      await initCorridor(studio, canvas, graph);
      applyPacketVisibility();
      state.chamberWorldPos = chamberWorldPos;
      window.__DS_FIELD_PANEL?.bindWalk?.(state);
      syncOutcomesHud();
      syncPacketsHud();
      setStatus(`Switched to ${graph.kind} layout`);
      loop();
    } catch (err) {
      console.error("[DS Walk rebuild]", err);
      showWalkError(`Rebuild failed: ${err.message}`);
    }
  }

  function close(silent) {
    cancelAnimationFrame(state.animId);
    state.animId = 0;
    state._inputCleanup?.();
    if (state._resize) window.removeEventListener("resize", state._resize);
    disposeScene();
    state.fly = null;
    state.keys = {};
    state.pointerLocked = false;
    if (state.overlay) {
      state.overlay.hidden = true;
      state.overlay.setAttribute("aria-hidden", "true");
      state.overlay.innerHTML = "";
    }
    if (state.studio && !silent) {
      state.studio.roomView = "diagram";
      window.__DS_PREMIUM?.renderRoomViewToggle?.(state.studio);
      state.studio.scheduleFitView?.();
    }
    window.__DS_FIELD_PANEL?.close?.();
    window.__DS_WALK_QUEST?.end?.(false);
    if (window.__DS_WALK_LAYOUT_MODE?.isActive?.()) window.__DS_WALK_LAYOUT_MODE.toggle?.();
    window.__DS_WALK_AUDIO?.stop?.();
    state.mode = null;
    if (!silent) state.studio = null;
  }

  function debugStats() {
    return {
      mode: state.mode,
      graphKind: state.graph?.kind,
      pos: { x: state.pos.x, z: state.pos.z },
      pods: state.devicePods.length,
      cables: state.cables.length,
      hasRenderer: !!state.renderer,
      photos: state.devicePods.filter(p => p.userData?.chamber?.photoUrl).length,
      outcomes: !!state.outcomes,
      outcomeObjects: state.outcomeGroup?.children?.length || 0,
      environmentTags: { ...(state.environmentTags || {}) },
      semanticFrame: state.graph?.semanticFrame || null,
      chambers: (state.chambers || []).map(ch => ({
        id: ch.id, label: ch.label, zone: ch.zone,
        x: ch.pos?.x, y: ch.pos?.y, z: ch.pos?.z,
        kind: ch.semantic?.kind, why: ch.semantic?.why
      }))
    };
  }

  window.__DS_WALK_QUEST?.register?.({
    getState: () => state,
    THREE: () => state.THREE,
    makeCableRun,
    podLift,
    MEDIA_COLORS,
    setStatus,
    teleportToChamber,
    applyPacketVisibility,
    buildConnectedNav
  });

  window.__DS_WALK_LAYOUT_MODE?.register?.({
    getState: () => state,
    THREE: () => state.THREE,
    setStatus,
    makeCableRun,
    applyPacketVisibility,
    buildConnectedNav,
    snapToWalkable
  });

  window.__DS_WALK = {
    open, close, rebuild, syncWalkIfOpen,
    toggle: s => state.mode ? close(true) : open(s),
    isOpen: () => !!state.mode, debugStats, hasRoute: () => !!state.route,
    flyToChamberById
  };
})();
