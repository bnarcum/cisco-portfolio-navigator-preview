/**
 * Design Studio Walk — procedural 3D device models + optional glTF override
 */
(function () {
  "use strict";

  let _THREE = null;
  let _gltfLoader = null;
  let _gltfLoading = null;
  const _gltfCache = new Map();
  const _gltfPending = new Map();
  const _gltfExists = new Map();

  const TEMPLATE_KEYS = [
    "switch", "switch-chassis", "router", "firewall", "nexus", "server", "ap",
    "codec", "camera", "touch", "display", "ceiling-mic", "table-mic",
    "cloud", "user", "rack", "table", "generic", "photo-shell"
  ];

  /** Room stencils with matrix photos — render photo-forward shells instead of chunky procedural bodies. */
  const PHOTO_SHELL_STENCILS = new Set([
    "room-kit-eq", "room-kit-pro", "room-bar", "board-pro", "desk-pro",
    "quad-cam", "room-navigator", "touch-10", "ceiling-mic", "table-mic"
  ]);

  /** Per-stencil mount + proportions for photo shells. */
  const PHOTO_SHELL_PROFILES = {
    "room-bar": { mount: "shelf", aspect: 3.1, targetH: 0.26, depth: 0.12 },
    "board-pro": { mount: "wall", aspect: 1.42, targetH: 1.05, depth: 0.07 },
    "desk-pro": { mount: "desk", aspect: 1.15, targetH: 0.48, depth: 0.1, tilt: 0.18 },
    "room-kit-eq": { mount: "rack", aspect: 1.55, targetH: 0.4, depth: 0.52 },
    "room-kit-pro": { mount: "rack", aspect: 1.48, targetH: 0.46, depth: 0.55 },
    "quad-cam": { mount: "wall", aspect: 2.0, targetH: 0.2, depth: 0.09 },
    "room-navigator": { mount: "wall", aspect: 1.05, targetH: 0.32, depth: 0.07 },
    "touch-10": { mount: "table", aspect: 0.72, targetH: 0.36, depth: 0.045, tilt: 0.24 },
    "ceiling-mic": { mount: "ceiling", aspect: 1.0, targetH: 0.26, depth: 0.2 },
    "table-mic": { mount: "table", aspect: 1.0, targetH: 0.3, depth: 0.11 }
  };

  const STENCIL_TEMPLATE = {
    "board-pro": "display",
    "desk-pro": "display",
    "room-bar": "codec",
    "room-kit-eq": "codec",
    "room-kit-pro": "codec",
    "quad-cam": "camera",
    "room-navigator": "touch",
    "display-75": "display",
    "display-86": "display"
  };

  function init(THREE) {
    if (THREE) _THREE = THREE;
  }

  function resolveTemplate(ch, def) {
    const shape = (def?.shape || "").toLowerCase();
    const role = (def?.role || "").toLowerCase();
    const sid = (ch?.stencilId || "").toLowerCase();

    // Canonical registry mesh wins — one source of truth for which model
    // renders, instead of re-guessing from shape/role/label per stencil.
    const prof = window.__DS_STENCILS?.deviceProfile?.(ch?.stencilId, ch);
    if (prof?.model3d) return prof.model3d;

    if (STENCIL_TEMPLATE[sid]) return STENCIL_TEMPLATE[sid];
    if (shape === "rack" || sid.includes("rack") || sid.includes("credenza")) return "rack";
    if (shape === "table" || sid.includes("table") || sid.includes("furn")) return "table";
    if (shape === "switch" || role === "collab-switch" || role === "access" || role === "core" || role === "distribution") {
      if (def?.ports === "switch-chassis" || (def?.rackU && def.rackU > 1)) return "switch-chassis";
      if (shape === "switch") return "switch";
    }
    const byShape = {
      router: "router", firewall: "firewall", nexus: "nexus", server: "server",
      ap: "ap", codec: "codec", camera: "camera", touch: "touch", display: "display",
      "ceiling-mic": "ceiling-mic", "table-mic": "table-mic", mic: "table-mic",
      cloud: "cloud", user: "user", rack: "rack", table: "table"
    };
    if (byShape[shape]) return byShape[shape];
    if (role === "firewall") return "firewall";
    if (role === "ap") return "ap";
    if (role === "spine" || role === "leaf") return "nexus";
    if (role === "wan-edge") return "router";
    if (role === "cloud" || role === "dns" || role === "logical") return shape === "user" ? "user" : "cloud";
    if (role === "ise" || role === "controller" || role === "management" || role === "compute" || role === "apic") return "server";
    return "generic";
  }

  function gltfPath(template, stencilId) {
    const base = "assets/models/walk/";
    return {
      stencil: stencilId ? `${base}${stencilId}.glb` : null,
      template: `${base}${template}.glb`
    };
  }

  function gltfUrl(path) {
    return new URL(path, document.baseURI).href;
  }

  async function gltfExists(path) {
    if (!path) return false;
    if (_gltfExists.has(path)) return _gltfExists.get(path);
    try {
      const res = await fetch(gltfUrl(path), { method: "HEAD" });
      const ok = res.ok;
      _gltfExists.set(path, ok);
      return ok;
    } catch {
      _gltfExists.set(path, false);
      return false;
    }
  }

  async function loadGltfLoader(THREE) {
    if (_gltfLoader) return _gltfLoader;
    if (_gltfLoading) return _gltfLoading;
    _gltfLoading = (async () => {
      const url = new URL("vendor/GLTFLoader.module.js", document.baseURI).href;
      const mod = await import(/* @vite-ignore */ url);
      const Loader = mod.GLTFLoader || mod.default;
      _gltfLoader = new Loader();
      if (THREE?.LoadingManager) _gltfLoader.setCrossOrigin("anonymous");
      return _gltfLoader;
    })();
    return _gltfLoading;
  }

  async function loadGltfScene(THREE, path) {
    if (_gltfCache.has(path)) return _gltfCache.get(path);
    if (_gltfPending.has(path)) return _gltfPending.get(path);
    const p = (async () => {
      const loader = await loadGltfLoader(THREE);
      const gltf = await loader.loadAsync(gltfUrl(path));
      _gltfCache.set(path, gltf.scene);
      _gltfPending.delete(path);
      return gltf.scene;
    })();
    _gltfPending.set(path, p);
    try {
      return await p;
    } catch {
      _gltfPending.delete(path);
      return null;
    }
  }

  function stdMat(THREE, color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: opts.metalness ?? 0.55,
      roughness: opts.roughness ?? 0.42,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      map: opts.map || null
    });
  }

  function accentMat(THREE, theme, opts = {}) {
    return stdMat(THREE, theme.accent, { metalness: 0.35, roughness: 0.28, emissive: theme.accent, emissiveIntensity: 0.55, ...opts });
  }

  function fitGroup(group, targetH = 1.5) {
    const T = _THREE;
    if (!T) return group;
    const box = new T.Box3().setFromObject(group);
    if (box.isEmpty()) return group;
    const size = new T.Vector3();
    box.getSize(size);
    const h = size.y || 0.01;
    const s = targetH / h;
    group.scale.setScalar(s);
    box.setFromObject(group);
    group.position.y -= box.min.y;
    return group;
  }

  function photoFaceMat(THREE, photoTex, intensity = 0.12) {
    const mat = stdMat(THREE, 0xffffff, {
      map: photoTex, metalness: 0.04, roughness: 0.36,
      emissive: 0xffffff, emissiveIntensity: intensity
    });
    if (mat.emissiveMap !== undefined) mat.emissiveMap = photoTex;
    return mat;
  }

  function addPhotoInset(THREE, parent, photoTex, w, h, z, theme, large = false) {
    if (!photoTex) return null;
    const pw = large ? w * 0.88 : w * 0.78;
    const ph = large ? h * 0.82 : h * 0.62;
    const bezel = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.92, h * 0.88),
      stdMat(THREE, 0x0a1018, { metalness: 0.85, roughness: 0.2 })
    );
    bezel.position.set(0, h * 0.08, z);
    parent.add(bezel);
    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      photoFaceMat(THREE, photoTex, large ? 0.14 : 0.1)
    );
    photo.position.set(0, h * 0.1, z + 0.004);
    parent.add(photo);
    photo.userData.isPhotoFace = true;
    return photo;
  }

  function makeDisplayGlowTexture(THREE) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 144;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 256, 144);
    g.addColorStop(0, "#0c1a2e");
    g.addColorStop(0.45, "#143050");
    g.addColorStop(1, "#0a1628");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 144);
    ctx.fillStyle = "rgba(2,200,255,0.12)";
    ctx.fillRect(18, 18, 220, 108);
    ctx.strokeStyle = "rgba(2,200,255,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, 220, 108);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 22px system-ui,sans-serif";
    ctx.fillText("Teams", 32, 52);
    ctx.fillStyle = "rgba(180,210,240,0.7)";
    ctx.font = "14px system-ui,sans-serif";
    ctx.fillText("Ready to join", 32, 78);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
    return tex;
  }

  function buildPhotoShell(THREE, opts) {
    const { photoTex, theme, scale, ch } = opts;
    let profile = { ...(PHOTO_SHELL_PROFILES[ch?.stencilId] || { mount: "shelf", aspect: 1.4, targetH: 0.5, depth: 0.18 }) };
    if (ch?.stencilId === "room-navigator" && (ch?.zone === "table" || ch?.zone === "desk")) {
      profile = { mount: "table", aspect: 0.72, targetH: 0.36, depth: 0.045, tilt: 0.24 };
    }
    const g = new THREE.Group();
    const h = profile.targetH * scale;
    const w = h * profile.aspect;
    const d = profile.depth * scale;
    const frameMat = stdMat(THREE, 0x141c28, { metalness: 0.82, roughness: 0.28 });
    const trimMat = stdMat(THREE, 0x0a1018, { metalness: 0.9, roughness: 0.18 });

    if (profile.mount === "wall") {
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
      back.position.set(0, h / 2, -d * 0.35);
      g.add(back);
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 1.02, d * 0.35), trimMat);
      bezel.position.set(0, h / 2, d * 0.02);
      g.add(bezel);
    } else if (profile.mount === "ceiling") {
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1 * scale, 0.1 * scale, 0.04 * scale, 16),
        frameMat
      );
      plate.position.y = h + 0.55 * scale;
      g.add(plate);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02 * scale, 0.025 * scale, 0.45 * scale, 8),
        stdMat(THREE, 0x4a5565, { metalness: 0.8, roughness: 0.3 })
      );
      stem.position.y = h + 0.28 * scale;
      g.add(stem);
      const puck = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.48, w * 0.42, d, 24),
        trimMat
      );
      puck.position.y = h / 2;
      g.add(puck);
    } else if (profile.mount === "table") {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12 * scale, 0.14 * scale, 0.03 * scale, 18),
        frameMat
      );
      base.position.y = 0.015;
      g.add(base);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03 * scale, 0.04 * scale, h * 0.35, 10),
        frameMat
      );
      post.position.y = h * 0.2;
      g.add(post);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), trimMat);
      body.position.set(0, h * 0.55, d * 0.15);
      body.rotation.x = -(profile.tilt || 0.2);
      g.add(body);
    } else if (profile.mount === "rack") {
      rackEars(THREE, g, h, d, theme);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h * 0.92, d), frameMat);
      body.position.set(0, h / 2, 0);
      g.add(body);
      statusLights(THREE, g, h * 0.82, d / 2 + 0.02, theme);
    } else {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.85, d), frameMat);
      shelf.position.set(0, h * 0.42, 0);
      g.add(shelf);
    }

    const faceZ = profile.mount === "wall" ? d * 0.2 + 0.006
      : profile.mount === "rack" ? d / 2 + 0.008
      : profile.mount === "ceiling" ? d / 2 + 0.006
      : d * 0.28 + 0.006;
    const faceY = profile.mount === "table" ? h * 0.55 : h / 2;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.9, h * 0.9),
      photoFaceMat(THREE, photoTex, 0.15)
    );
    face.position.set(0, faceY, faceZ);
    if (profile.mount === "table") face.rotation.x = -(profile.tilt || 0.2);
    face.userData.isPhotoFace = true;
    g.add(face);
    g.userData.photoMesh = face;
    return fitGroup(g, Math.max(h, 0.35) * 1.05);
  }

  function portRow(THREE, parent, count, y, z, w, theme) {
    const g = new THREE.Group();
    const spacing = w / (count + 1);
    for (let i = 0; i < count; i++) {
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.028, 0.018),
        accentMat(THREE, theme, { emissiveIntensity: 0.35 + (i % 3) * 0.15 })
      );
      led.position.set(-w / 2 + spacing * (i + 1), y, z);
      g.add(led);
    }
    parent.add(g);
    return g;
  }

  function rackEars(THREE, parent, h, d, theme) {
    [-1, 1].forEach(sx => {
      const ear = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, h, d),
        stdMat(THREE, 0x3a4450, { metalness: 0.9, roughness: 0.22 })
      );
      ear.position.set(sx * 0.56, h / 2, 0);
      parent.add(ear);
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.07, 8),
        accentMat(THREE, theme, { emissiveIntensity: 0.2 })
      );
      hole.rotation.z = Math.PI / 2;
      hole.position.set(sx * 0.56, h * 0.72, d * 0.35);
      parent.add(hole);
    });
  }

  function statusLights(THREE, parent, y, z, theme) {
    [0x44cc88, 0x02c8ff, 0xff9000].forEach((c, i) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 8, 8),
        stdMat(THREE, c, { emissive: c, emissiveIntensity: 0.85, metalness: 0.2, roughness: 0.3 })
      );
      m.position.set(-0.22 + i * 0.12, y, z);
      parent.add(m);
    });
  }

  function buildSwitch1u(THREE, opts) {
    const { photoTex, theme, scale, kind } = opts;
    const g = new THREE.Group();
    const w = 1.0 * scale, h = 0.22 * scale, d = 0.72 * scale;
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      stdMat(THREE, 0x1a2535, { metalness: 0.78, roughness: 0.32 })
    );
    chassis.position.y = h / 2;
    g.add(chassis);
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.96, h * 0.82, 0.02),
      stdMat(THREE, 0x0e1828, { metalness: 0.85, roughness: 0.25 })
    );
    face.position.set(0, h / 2, d / 2 + 0.01);
    g.add(face);
    portRow(THREE, g, 12, h * 0.35, d / 2 + 0.025, w * 0.85, theme);
    rackEars(THREE, g, h, d * 0.9, theme);
    statusLights(THREE, g, h * 0.78, d / 2 + 0.03, theme);
    const photo = photoTex
      ? addPhotoInset(THREE, g, photoTex,
        kind === "network" ? w * 0.5 : w * 0.35,
        kind === "network" ? h * 0.82 : h * 0.55,
        d / 2 + 0.022, theme, kind === "network")
      : null;
    g.userData.photoMesh = photo;
    return fitGroup(g, 0.35 * scale);
  }

  function buildSwitchChassis(THREE, opts) {
    const { photoTex, theme, scale } = opts;
    const g = new THREE.Group();
    const w = 1.05 * scale, h = 1.35 * scale, d = 0.78 * scale;
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      stdMat(THREE, 0x141e2e, { metalness: 0.8, roughness: 0.3 })
    );
    chassis.position.y = h / 2;
    g.add(chassis);
    for (let i = 0; i < 4; i++) {
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.88, h * 0.18, 0.04),
        stdMat(THREE, 0x0c1420, { metalness: 0.7, roughness: 0.35 })
      );
      slot.position.set(0, h * 0.18 + i * h * 0.2, d / 2 + 0.025);
      g.add(slot);
      portRow(THREE, g, 8, h * 0.18 + i * h * 0.2 + 0.02, d / 2 + 0.045, w * 0.75, theme);
    }
    rackEars(THREE, g, h, d, theme);
    statusLights(THREE, g, h * 0.92, d / 2 + 0.04, theme);
    const photo = addPhotoInset(THREE, g, photoTex, w * 0.4, h * 0.12, d / 2 + 0.03, theme);
    g.userData.photoMesh = photo;
    return fitGroup(g, 1.65 * scale);
  }

  function buildRouter(THREE, opts) {
    const { photoTex, theme, scale } = opts;
    const g = new THREE.Group();
    const w = 0.95 * scale, h = 0.28 * scale, d = 0.68 * scale;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(THREE, 0x1c2838, { metalness: 0.75, roughness: 0.34 }));
    body.position.y = h / 2;
    g.add(body);
    const wan = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.06, 0.04),
      accentMat(THREE, theme, { emissiveIntensity: 0.9 })
    );
    wan.position.set(-w * 0.38, h * 0.55, d / 2 + 0.025);
    g.add(wan);
    portRow(THREE, g, 4, h * 0.35, d / 2 + 0.02, w * 0.5, theme);
    statusLights(THREE, g, h * 0.75, d / 2 + 0.03, theme);
    const photo = addPhotoInset(THREE, g, photoTex, w * 0.3, h * 0.5, d / 2 + 0.018, theme);
    g.userData.photoMesh = photo;
    return fitGroup(g, 0.4 * scale);
  }

  function buildFirewall(THREE, opts) {
    const g = buildSwitch1u(THREE, opts);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.92 * opts.scale, 0.04 * opts.scale, 0.03),
      stdMat(THREE, 0xff3355, { emissive: 0xff2244, emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.35 })
    );
    stripe.position.set(0, 0.18 * opts.scale, 0.38 * opts.scale);
    g.add(stripe);
    return g;
  }

  function buildNexus(THREE, opts) {
    const { photoTex, theme, scale } = opts;
    const g = new THREE.Group();
    const w = 1.1 * scale, h = 0.32 * scale, d = 0.82 * scale;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(THREE, 0x101828, { metalness: 0.82, roughness: 0.28 }));
    body.position.y = h / 2;
    g.add(body);
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.15, h * 0.7, d * 0.85),
      accentMat(THREE, theme, { emissiveIntensity: 0.45 })
    );
    spine.position.set(0, h / 2, 0);
    g.add(spine);
    portRow(THREE, g, 16, h * 0.3, d / 2 + 0.025, w * 0.9, theme);
    portRow(THREE, g, 8, h * 0.72, d / 2 + 0.025, w * 0.6, theme);
    rackEars(THREE, g, h, d, theme);
    const photo = addPhotoInset(THREE, g, photoTex, w * 0.28, h * 0.45, d / 2 + 0.02, theme);
    g.userData.photoMesh = photo;
    return fitGroup(g, 0.45 * scale);
  }

  function buildServer2u(THREE, opts) {
    const { photoTex, theme, scale } = opts;
    const g = new THREE.Group();
    const w = 0.88 * scale, h = 0.52 * scale, d = 0.9 * scale;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(THREE, 0x1a2230, { metalness: 0.72, roughness: 0.38 }));
    body.position.y = h / 2;
    g.add(body);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, h * 0.22, 0.03), stdMat(THREE, 0x0a1018, { metalness: 0.88, roughness: 0.2 }));
    bezel.position.set(0, h * 0.72, d / 2 + 0.018);
    g.add(bezel);
    for (let i = 0; i < 6; i++) {
      const vent = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.7, 0.018, 0.015),
        stdMat(THREE, 0x2a3545, { metalness: 0.6, roughness: 0.5 })
      );
      vent.position.set(0, h * 0.25 + i * 0.045, d / 2 + 0.02);
      g.add(vent);
    }
    rackEars(THREE, g, h, d * 0.95, theme);
    statusLights(THREE, g, h * 0.82, d / 2 + 0.035, theme);
    const photo = addPhotoInset(THREE, g, photoTex, w * 0.35, h * 0.2, d / 2 + 0.025, theme);
    g.userData.photoMesh = photo;
    return fitGroup(g, 0.65 * scale);
  }

  function buildApCeiling(THREE, opts) {
    const { photoTex, theme, scale } = opts;
    const g = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, 0.35 * scale, 12),
      stdMat(THREE, 0x3a4450, { metalness: 0.85, roughness: 0.25 })
    );
    stem.position.y = 0.175 * scale;
    g.add(stem);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42 * scale, 0.44 * scale, 0.08 * scale, 32),
      stdMat(THREE, 0xf0f4f8, { metalness: 0.35, roughness: 0.45 })
    );
    disc.position.y = 0.39 * scale;
    g.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.32 * scale, 0.018 * scale, 8, 32),
      accentMat(THREE, theme, { emissiveIntensity: 0.65 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.42 * scale;
    g.add(ring);
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 * scale, 8, 8),
      stdMat(THREE, 0x44cc88, { emissive: 0x44cc88, emissiveIntensity: 0.9 })
    );
    led.position.set(0, 0.44 * scale, 0.2 * scale);
    g.add(led);
    const photo = addPhotoInset(THREE, g, photoTex, 0.28 * scale, 0.2 * scale, 0.22 * scale, theme);
    if (photo) photo.rotation.x = -0.15;
    g.userData.photoMesh = photo;
    return fitGroup(g, 0.55 * scale);
  }

  function buildCodecBar(THREE, opts) {
    const { photoTex, theme, scale } = opts;
    const g = new THREE.Group();
    const w = 1.35 * scale, h = 0.22 * scale, d = 0.18 * scale;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(THREE, 0x1a2538, { metalness: 0.78, roughness: 0.3 }));
    bar.position.y = h / 2 + 0.15 * scale;
    g.add(bar);
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 * scale, 12, 12),
      stdMat(THREE, 0x0a1420, { metalness: 0.9, roughness: 0.15, emissive: theme.accent, emissiveIntensity: 0.25 })
    );
    lens.position.set(w * 0.35, h / 2 + 0.15 * scale, d / 2 + 0.05 * scale);
    g.add(lens);
    const grill = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.5, h * 0.5, 0.02),
      stdMat(THREE, 0x2a3545, { metalness: 0.5, roughness: 0.55 })
    );
    grill.position.set(-w * 0.15, h / 2 + 0.15 * scale, d / 2 + 0.012);
    g.add(grill);
    const photo = addPhotoInset(THREE, g, photoTex, w * 0.55, h * 0.75, d / 2 + 0.02, theme);
    if (photo) photo.position.y = h / 2 + 0.15 * scale;
    g.userData.photoMesh = photo;
    return fitGroup(g, 0.45 * scale);
  }

  function buildCameraBar(THREE, opts) {
    const { theme, scale } = opts;
    const g = new THREE.Group();
    const w = 0.55 * scale, h = 0.14 * scale, d = 0.12 * scale;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(THREE, 0x1e2838, { metalness: 0.8, roughness: 0.28 }));
    bar.position.y = h / 2 + 0.2 * scale;
    g.add(bar);
    [-0.14, 0, 0.14].forEach((ox, i) => {
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045 * scale, 0.05 * scale, 0.04 * scale, 16),
        stdMat(THREE, 0x050a10, { metalness: 0.95, roughness: 0.1, emissive: theme.accent, emissiveIntensity: 0.15 + i * 0.1 })
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(ox * scale, h / 2 + 0.2 * scale, d / 2 + 0.03 * scale);
      g.add(lens);
    });
    return fitGroup(g, 0.38 * scale);
  }

  function buildTouchPanel(THREE, opts) {
    const { photoTex, theme, scale } = opts;
    const g = new THREE.Group();
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.12 * scale, 0.35 * scale, 0.1 * scale),
      stdMat(THREE, 0x3a4450, { metalness: 0.85, roughness: 0.25 })
    );
    bracket.position.set(0, 0.55 * scale, -0.08 * scale);
    g.add(bracket);
    const tablet = new THREE.Mesh(
      new THREE.BoxGeometry(0.42 * scale, 0.32 * scale, 0.04 * scale),
      stdMat(THREE, 0x1a2538, { metalness: 0.7, roughness: 0.32 })
    );
    tablet.position.set(0, 0.72 * scale, 0.04 * scale);
    tablet.rotation.x = -0.22;
    g.add(tablet);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36 * scale, 0.24 * scale),
      photoTex
        ? stdMat(THREE, 0xffffff, { map: photoTex, metalness: 0.05, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.12 })
        : accentMat(THREE, theme, { emissiveIntensity: 0.35 })
    );
    screen.position.set(0, 0.74 * scale, 0.065 * scale);
    screen.rotation.x = -0.22;
    if (photoTex && screen.material.emissiveMap !== undefined) screen.material.emissiveMap = photoTex;
    g.add(screen);
    g.userData.photoMesh = photoTex ? screen : null;
    return fitGroup(g, 1.1 * scale);
  }

  function isAuxDisplay(ch) {
    const s = `${ch?.stencilId || ""} ${ch?.label || ""}`.toLowerCase();
    return /aux|secondary|content display|confidence|people display/i.test(s)
      || (/display-86|86/.test(s) && !/primary|main|board|front/i.test(s));
  }

  function isWallMountedDisplay(ch, kind) {
    if (kind !== "room") return false;
    const z = (ch?.zone || "").toLowerCase();
    return z === "display" || z === "wall";
  }

  function buildDisplayPanel(THREE, opts) {
    const { photoTex, theme, scale, ch, kind } = opts;
    const g = new THREE.Group();
    const wallMount = isWallMountedDisplay(ch, kind);
    const isAux = isAuxDisplay(ch);
    const isLarge = !wallMount && /display-86|86/.test(ch?.stencilId || ch?.label || "");
    const w = wallMount
      ? (isAux ? 1.15 : 1.45) * scale
      : (isLarge ? 1.85 : 1.55) * scale;
    const h = wallMount
      ? (isAux ? 0.68 : 0.86) * scale
      : (isLarge ? 1.05 : 0.88) * scale;
    const d = 0.06 * scale;
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      stdMat(THREE, 0x0a1420, { metalness: 0.85, roughness: 0.18 })
    );
    screen.position.y = h / 2 + (wallMount ? 0 : 0.08 * scale);
    g.add(screen);
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.03, h * 1.03, d * 0.4),
      stdMat(THREE, 0x080e18, { metalness: 0.92, roughness: 0.15 })
    );
    bezel.position.set(0, screen.position.y, wallMount ? -d * 0.12 : -d * 0.15);
    g.add(bezel);
    let faceMat;
    if (photoTex) {
      faceMat = photoFaceMat(THREE, photoTex, 0.16);
    } else {
      const glowTex = makeDisplayGlowTexture(THREE);
      faceMat = stdMat(THREE, 0xffffff, {
        map: glowTex, metalness: 0.05, roughness: 0.35,
        emissive: 0x1a4060, emissiveIntensity: 0.28
      });
      if (faceMat.emissiveMap !== undefined) faceMat.emissiveMap = glowTex;
    }
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.9), faceMat);
    face.position.set(0, screen.position.y, d / 2 + 0.005);
    face.userData.isPhotoFace = true;
    g.add(face);
    if (!wallMount) {
      const neck = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 * scale, 0.35 * scale, 0.1 * scale),
        stdMat(THREE, 0x2a3440, { metalness: 0.8, roughness: 0.28 })
      );
      neck.position.set(0, 0.42 * scale, -0.02 * scale);
      g.add(neck);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.55 * scale, 0.04 * scale, 0.28 * scale),
        stdMat(THREE, 0x1e2838, { metalness: 0.75, roughness: 0.32 })
      );
      base.position.set(0, 0.02, 0.05 * scale);
      g.add(base);
    }
    g.userData.photoMesh = face;
    const targetH = wallMount
      ? (isAux ? 0.95 : 1.2) * scale
      : (isLarge ? 1.95 : 1.65) * scale;
    return fitGroup(g, targetH);
  }

  function buildCeilingMic(THREE, opts) {
    const { theme, scale } = opts;
    const g = new THREE.Group();
    // Ceiling mount plate at the top (where the PoE cable runs into the plenum).
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11 * scale, 0.11 * scale, 0.05 * scale, 16),
      stdMat(THREE, 0x3a4450, { metalness: 0.85, roughness: 0.25 })
    );
    plate.position.y = 0.9 * scale;
    g.add(plate);
    // Drop stem hanging the mic down from the ceiling.
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025 * scale, 0.025 * scale, 0.55 * scale, 8),
      stdMat(THREE, 0x4a5565, { metalness: 0.8, roughness: 0.3 })
    );
    stem.position.y = 0.6 * scale;
    g.add(stem);
    // Mic capsule facing down toward the table.
    const puck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * scale, 0.18 * scale, 0.08 * scale, 24),
      stdMat(THREE, 0xf0f4f8, { metalness: 0.4, roughness: 0.42 })
    );
    puck.position.y = 0.25 * scale;
    g.add(puck);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.17 * scale, 0.014 * scale, 8, 24),
      accentMat(THREE, theme, { emissiveIntensity: 0.6 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.22 * scale;
    g.add(ring);
    return fitGroup(g, 0.95 * scale);
  }

  function buildTableMic(THREE, opts) {
    const { theme, scale } = opts;
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14 * scale, 0.16 * scale, 0.04 * scale, 20),
      stdMat(THREE, 0x2a3440, { metalness: 0.75, roughness: 0.32 })
    );
    base.position.y = 0.02;
    g.add(base);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035 * scale, 0.045 * scale, 0.22 * scale, 10),
      stdMat(THREE, 0x3a4450, { metalness: 0.82, roughness: 0.28 })
    );
    stem.position.y = 0.14 * scale;
    g.add(stem);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08 * scale, 0.09 * scale, 0.1 * scale, 16),
      stdMat(THREE, 0xe8ecf0, { metalness: 0.35, roughness: 0.45 })
    );
    cap.position.y = 0.28 * scale;
    g.add(cap);
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.025 * scale, 8, 8),
      accentMat(THREE, theme, { emissiveIntensity: 0.8 })
    );
    led.position.set(0, 0.33 * scale, 0.06 * scale);
    g.add(led);
    return fitGroup(g, 0.38 * scale);
  }

  function buildCloud(THREE, opts) {
    const { theme, scale } = opts;
    const g = new THREE.Group();
    const clusters = [
      [0, 0.5, 0, 0.35], [0.28, 0.42, 0.12, 0.28], [-0.25, 0.45, -0.1, 0.26],
      [0.1, 0.62, -0.15, 0.22], [-0.12, 0.58, 0.18, 0.24]
    ];
    clusters.forEach(([x, y, z, r]) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r * scale, 16, 12),
        new THREE.MeshStandardMaterial({
          color: 0x88ccff, metalness: 0.15, roughness: 0.55,
          emissive: theme.accent, emissiveIntensity: 0.35, transparent: true, opacity: 0.88
        })
      );
      m.position.set(x * scale, y * scale, z * scale);
      g.add(m);
    });
    return fitGroup(g, 1.2 * scale);
  }

  function buildUser(THREE, opts) {
    const { theme, scale } = opts;
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * scale, 0.28 * scale, 0.65 * scale, 12),
      stdMat(THREE, 0x3a5070, { metalness: 0.4, roughness: 0.5 })
    );
    body.position.y = 0.55 * scale;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.2 * scale, 12, 10),
      stdMat(THREE, 0x4a6080, { metalness: 0.35, roughness: 0.48 })
    );
    head.position.y = 1.05 * scale;
    g.add(head);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.32 * scale, 0.02 * scale, 8, 24),
      accentMat(THREE, theme, { emissiveIntensity: 0.5 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.02;
    g.add(halo);
    return fitGroup(g, 1.35 * scale);
  }

  function buildRack(THREE, opts) {
    const { theme, scale } = opts;
    const g = new THREE.Group();
    const w = 0.75 * scale, h = 1.5 * scale, d = 0.65 * scale;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      stdMat(THREE, 0x1a2535, { metalness: 0.78, roughness: 0.32 })
    );
    frame.position.y = h / 2;
    g.add(frame);
    for (let i = 0; i < 3; i++) {
      const unit = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.88, h * 0.22, d * 0.85),
        stdMat(THREE, 0x0e1828, { metalness: 0.7, roughness: 0.38 })
      );
      unit.position.set(0, h * 0.2 + i * h * 0.28, 0);
      g.add(unit);
      statusLights(THREE, g, h * 0.2 + i * h * 0.28 + h * 0.08, d / 2 + 0.02, theme);
    }
    rackEars(THREE, g, h, d, theme);
    return fitGroup(g, 1.65 * scale);
  }

  function buildTable(THREE, opts) {
    const { scale } = opts;
    const g = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.8 * scale, 0.08 * scale, 0.9 * scale),
      stdMat(THREE, 0x4a3c30, { metalness: 0.08, roughness: 0.62 })
    );
    top.position.y = 0.76 * scale;
    g.add(top);
    [[-0.75, -0.32], [0.75, -0.32], [-0.75, 0.32], [0.75, 0.32]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, 0.72 * scale, 8),
        stdMat(THREE, 0x3a3028, { metalness: 0.15, roughness: 0.55 })
      );
      leg.position.set(x * scale, 0.36 * scale, z * scale);
      g.add(leg);
    });
    return fitGroup(g, 0.85 * scale);
  }

  function buildGeneric(THREE, opts) {
    const { photoTex, theme, scale } = opts;
    const g = new THREE.Group();
    const w = 0.85 * scale, h = 0.55 * scale, d = 0.55 * scale;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(THREE, 0x1a2838, { metalness: 0.72, roughness: 0.36 }));
    box.position.y = h / 2;
    g.add(box);
    const chamfer = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, h * 0.15, d * 0.92),
      accentMat(THREE, theme, { emissiveIntensity: 0.3 })
    );
    chamfer.position.set(0, h * 0.88, 0);
    g.add(chamfer);
    const photo = addPhotoInset(THREE, g, photoTex, w * 0.55, h * 0.45, d / 2 + 0.015, theme);
    g.userData.photoMesh = photo;
    return fitGroup(g, 0.65 * scale);
  }

  const PROCEDURAL = {
    switch: buildSwitch1u,
    "switch-chassis": buildSwitchChassis,
    router: buildRouter,
    firewall: buildFirewall,
    nexus: buildNexus,
    server: buildServer2u,
    ap: buildApCeiling,
    codec: buildCodecBar,
    camera: buildCameraBar,
    touch: buildTouchPanel,
    display: buildDisplayPanel,
    "ceiling-mic": buildCeilingMic,
    "table-mic": buildTableMic,
    cloud: buildCloud,
    user: buildUser,
    rack: buildRack,
    table: buildTable,
    generic: buildGeneric
  };

  function networkLayerScale(ch, def) {
    const layer = (ch?.zone || def?.layer || "access").toLowerCase();
    if (layer === "core" || layer === "distribution" || layer === "dc") return 1.12;
    if (layer === "wan" || layer === "security") return 0.94;
    return 1;
  }

  function targetHeight(template, kind) {
    const map = {
      switch: 0.35, "switch-chassis": 1.65, router: 0.4, firewall: 0.38, nexus: 0.45,
      server: 0.65, ap: 0.55, codec: 0.45, camera: 0.38, touch: 1.1, display: 1.75,
      "ceiling-mic": 0.95, "table-mic": 0.38, cloud: 1.2, user: 1.35, rack: 1.65,
      table: 0.85, generic: 0.65
    };
    let h = map[template] || 0.65;
    if (kind === "network") h *= 0.88;
    return Math.min(2.0, Math.max(1.2, h * 1.05));
  }

  async function tryLoadGltf(THREE, template, stencilId, scale) {
    // Procedural models only at runtime — avoids dozens of HEAD requests that freeze the page.
    return null;
  }

  async function build(THREE, opts = {}) {
    const T = THREE || _THREE;
    if (!T) throw new Error("DS_WALK_MODELS.build requires THREE");
    init(T);
    const {
      ch = {}, def = null, kind = "room", photoTex = null,
      scale = 1, theme = { accent: 0x02c8ff }, lift = 0
    } = opts;
    const template = resolveTemplate(ch, def);
    const sid = ch?.stencilId || "";
    const layerScale = kind === "network" ? networkLayerScale(ch, def) : 1;
    const buildOpts = {
      photoTex, theme, scale: scale * layerScale, kind, lift, ch, def, template
    };

    let model = await tryLoadGltf(T, template, sid, scale);
    if (!model) {
      if (kind === "room" && photoTex && PHOTO_SHELL_STENCILS.has(sid)) {
        model = buildPhotoShell(T, buildOpts);
      } else {
        const fn = PROCEDURAL[template] || PROCEDURAL.generic;
        model = fn(T, buildOpts);
      }
    }

    const wrap = new T.Group();
    wrap.userData.template = template;
    wrap.userData.deviceModel = model;
    wrap.add(model);
    wrap.position.y = lift;

    if (!wrap.userData.photoMesh && model.userData?.photoMesh) {
      wrap.userData.photoMesh = model.userData.photoMesh;
    } else {
      model.traverse(obj => {
        if (!wrap.userData.photoMesh && obj.userData?.isPhotoFace) wrap.userData.photoMesh = obj;
      });
    }
    return wrap;
  }

  window.__DS_WALK_MODELS = {
    init,
    resolveTemplate,
    gltfPath,
    build,
    TEMPLATE_KEYS
  };
})();
