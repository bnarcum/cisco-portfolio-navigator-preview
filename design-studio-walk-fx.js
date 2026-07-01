/**
 * Design Studio — 3D walk cinematics (window.__DS_WALK_FX)
 *
 * Real-time "photoreal-lite" upgrades that work with the vendored three r170
 * core build + a small set of matching examples/jsm addons:
 *   - Post-processing pipeline (GTAO ambient occlusion, subtle bloom, optional
 *     depth-of-field, SMAA) with a robust fallback to plain rendering.
 *   - RectAreaLight-driven indoor lighting rigs for the meeting room and a
 *     data-center / NOC style network environment.
 *   - A sleek low-poly presenter avatar (replaces the voxel figure) that keeps
 *     the {head, torso, legL, legR, armL, armR} part interface the walk expects.
 *
 * Everything degrades gracefully: if an addon fails to load, callers keep the
 * previous behaviour (plain renderer, voxel avatar, existing lighting).
 */
(function () {
  "use strict";

  const JSM = () => new URL("vendor/jsm/", document.baseURI).href;
  let addons = null;
  let addonPromise = null;

  async function ensure() {
    if (addons) return addons;
    if (addonPromise) return addonPromise;
    addonPromise = (async () => {
      const b = JSM();
      const [EC, RP, GTAO, BLOOM, SMAA, OUT, BOKEH, RAL] = await Promise.all([
        import(/* @vite-ignore */ b + "postprocessing/EffectComposer.js"),
        import(/* @vite-ignore */ b + "postprocessing/RenderPass.js"),
        import(/* @vite-ignore */ b + "postprocessing/GTAOPass.js"),
        import(/* @vite-ignore */ b + "postprocessing/UnrealBloomPass.js"),
        import(/* @vite-ignore */ b + "postprocessing/SMAAPass.js"),
        import(/* @vite-ignore */ b + "postprocessing/OutputPass.js"),
        import(/* @vite-ignore */ b + "postprocessing/BokehPass.js"),
        import(/* @vite-ignore */ b + "lights/RectAreaLightUniformsLib.js")
      ]);
      addons = {
        EffectComposer: EC.EffectComposer,
        RenderPass: RP.RenderPass,
        GTAOPass: GTAO.GTAOPass,
        UnrealBloomPass: BLOOM.UnrealBloomPass,
        SMAAPass: SMAA.SMAAPass,
        OutputPass: OUT.OutputPass,
        BokehPass: BOKEH.BokehPass,
        RectAreaLightUniformsLib: RAL.RectAreaLightUniformsLib
      };
      try { addons.RectAreaLightUniformsLib.init(); } catch { /* non-fatal */ }
      return addons;
    })().catch(err => {
      console.warn("[DS Walk FX] addon load failed, falling back:", err);
      addons = null;
      addonPromise = null;
      return null;
    });
    return addonPromise;
  }

  function loaded() { return addons; }

  // ---- Post-processing pipeline -------------------------------------------

  function buildComposer(THREE, renderer, scene, camera, opts = {}) {
    if (!addons) return null;
    try {
      const size = new THREE.Vector2();
      renderer.getSize(size);
      const w = Math.max(2, size.x);
      const h = Math.max(2, size.y);
      const composer = new addons.EffectComposer(renderer);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);

      const renderPass = new addons.RenderPass(scene, camera);
      composer.addPass(renderPass);

      let gtao = null;
      try {
        gtao = new addons.GTAOPass(scene, camera, w, h);
        gtao.output = addons.GTAOPass.OUTPUT.Default;
        const radius = opts.aoRadius ?? 0.4;
        gtao.updateGtaoMaterial?.({
          radius,
          distanceExponent: 1.0,
          thickness: 1.0,
          scale: 1.0,
          samples: 16,
          distanceFallOff: 1.0,
          screenSpaceRadius: false
        });
        gtao.updatePdMaterial?.({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 8 });
        composer.addPass(gtao);
      } catch (e) {
        console.warn("[DS Walk FX] GTAO unavailable:", e);
        gtao = null;
      }

      const bloom = new addons.UnrealBloomPass(
        new THREE.Vector2(w, h),
        opts.bloomStrength ?? 0.32,
        opts.bloomRadius ?? 0.55,
        opts.bloomThreshold ?? 0.82
      );
      composer.addPass(bloom);

      let bokeh = null;
      try {
        bokeh = new addons.BokehPass(scene, camera, {
          focus: opts.dofFocus ?? 6.0,
          aperture: opts.dofAperture ?? 0.0006,
          maxblur: opts.dofMaxBlur ?? 0.008
        });
        bokeh.enabled = false; // only enabled when the view settles
        composer.addPass(bokeh);
      } catch (e) {
        bokeh = null;
      }

      const smaa = new addons.SMAAPass(w, h);
      composer.addPass(smaa);

      const output = new addons.OutputPass();
      composer.addPass(output);

      return {
        composer,
        passes: { renderPass, gtao, bloom, bokeh, smaa, output },
        setSize(width, height, pr) {
          composer.setPixelRatio(pr ?? renderer.getPixelRatio());
          composer.setSize(width, height);
          bloom.setSize?.(width, height);
          gtao?.setSize?.(width, height);
          bokeh?.setSize?.(width, height);
          smaa?.setSize?.(width, height);
        },
        setQuality(level) {
          // level: 2 = full, 1 = trimmed, 0 = minimal
          if (gtao) gtao.enabled = level >= 1;
          bloom.enabled = level >= 1;
          if (bokeh && level < 2) bokeh.enabled = false;
        },
        setBokeh(on) { if (bokeh) bokeh.enabled = !!on; },
        render(dt) { composer.render(dt); },
        dispose() { try { composer.dispose?.(); } catch { /* noop */ } }
      };
    } catch (err) {
      console.warn("[DS Walk FX] composer build failed, using plain render:", err);
      return null;
    }
  }

  // ---- Lighting rigs -------------------------------------------------------

  function shadowCam(sun, span) {
    const c = sun.shadow.camera;
    const r = Math.max(span * 0.75, 10);
    c.near = 0.5; c.far = span * 2.6 + 20;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.updateProjectionMatrix?.();
  }

  function roomLightRig(THREE, scene, bounds, renderer) {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 10);

    scene.add(new THREE.AmbientLight(0xdfe6f2, 0.22));
    scene.add(new THREE.HemisphereLight(0xeaf0fb, 0x2f353d, 0.62));

    const key = new THREE.DirectionalLight(0xfff4e2, 1.45);
    key.position.set(cx - span * 0.35, span * 0.9 + 6, bounds.minZ - span * 0.15);
    key.target.position.set(cx, 0.6, cz);
    scene.add(key.target);
    if (THREE.PCFSoftShadowMap !== undefined) {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.02;
      key.shadow.radius = 7;
      key.shadow.blurSamples = 16;
      shadowCam(key, span);
    }
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xc4d8f4, 0.3);
    fill.position.set(cx + span * 0.3, span * 0.5 + 4, bounds.maxZ + span * 0.2);
    scene.add(fill);

    // Screen-wall glow — needs RectAreaLightUniformsLib (loaded in ensure()).
    if (addons?.RectAreaLightUniformsLib) {
      const frontZ = Number.isFinite(bounds.minZ) ? bounds.minZ : cz;
      const rect = new THREE.RectAreaLight(0xbfe0ff, 3.4, Math.min(span * 0.7, 6), 1.7);
      rect.position.set(cx, 1.85, frontZ + 0.5);
      rect.lookAt(cx, 1.6, cz);
      scene.add(rect);
    }
    return { sun: key };
  }

  function nocLightRig(THREE, scene, bounds) {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 12);

    scene.add(new THREE.AmbientLight(0x1a2333, 0.34));
    scene.add(new THREE.HemisphereLight(0x2a4364, 0x080b12, 0.5));

    const key = new THREE.DirectionalLight(0xcfe6ff, 1.15);
    key.position.set(cx, span + 8, cz - span * 0.2);
    key.target.position.set(cx, 0, cz);
    scene.add(key.target);
    if (THREE.PCFSoftShadowMap !== undefined) {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.02;
      key.shadow.radius = 6;
      key.shadow.blurSamples = 12;
      shadowCam(key, span);
    }
    scene.add(key);
    return { sun: key };
  }

  // ---- Data-center / NOC environment --------------------------------------

  function gridTexture(THREE, make) {
    return make(THREE, (ctx, w, h) => {
      ctx.fillStyle = "#12181f";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(90,120,150,0.35)";
      ctx.lineWidth = 2;
      const step = w / 4;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(w, i * step); ctx.stroke();
      }
      ctx.fillStyle = "rgba(60,80,100,0.22)";
      for (let i = 0; i < 200; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }, 256, 256);
  }

  function buildNOC(THREE, scene, bounds, graph, helpers) {
    const { addTagged, box, makeCanvasTexture } = helpers;
    const pad = 10;
    const w = Math.max(bounds.maxX - bounds.minX + pad * 2, 26);
    const d = Math.max(bounds.maxZ - bounds.minZ + pad * 2, 26);
    const h = 6.2;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;

    // Sky/backdrop gradient.
    const bg = makeCanvasTexture(THREE, (ctx, cw, ch) => {
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "#1a2740");
      g.addColorStop(0.5, "#0e151f");
      g.addColorStop(1, "#070b12");
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    }, 4, 1024);
    scene.background = bg;
    scene.fog = new THREE.FogExp2(0x0b1119, 0.012);

    // Raised-floor tiles.
    const floorTex = gridTexture(THREE, makeCanvasTexture);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(w / 2.2, d / 2.2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: floorTex, color: 0x2a333f, metalness: 0.55, roughness: 0.42 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    addTagged(scene, floor, "network-noc-floor");

    // Perimeter walls (dark, low sheen).
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x161c25, metalness: 0.3, roughness: 0.7 });
    [
      { sx: w, sz: 0.3, x: cx, z: cz - d / 2 },
      { sx: w, sz: 0.3, x: cx, z: cz + d / 2 },
      { sx: 0.3, sz: d, x: cx - w / 2, z: cz },
      { sx: 0.3, sz: d, x: cx + w / 2, z: cz }
    ].forEach(wl => box(THREE, scene, "network-noc-wall", [wl.sx, h, wl.sz], [wl.x, h / 2, wl.z], wallMat));

    // Ceiling light strips running along the main aisle.
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e14, emissive: 0xbfe6ff, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.5
    });
    const strips = Math.max(3, Math.min(7, Math.round(w / 4)));
    for (let i = 0; i < strips; i++) {
      const x = cx - w / 2 + (i + 0.5) * (w / strips);
      const s = box(THREE, scene, "network-noc-lightstrip", [0.28, 0.1, d * 0.8], [x, h - 0.2, cz], stripMat);
      s.castShadow = false;
      s.userData.noShadow = true;
    }

    // Rack silhouettes lining the back wall — reads as a real equipment room
    // without colliding with the diagram-driven device pods in the aisle.
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x11161d, metalness: 0.62, roughness: 0.38 });
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.5, roughness: 0.6 });
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x0a0e14, emissive: 0x39d98a, emissiveIntensity: 1.6 });
    const rackCount = Math.max(4, Math.min(9, Math.round(w / 2.6)));
    const backZ = cz + d / 2 - 1.1;
    for (let i = 0; i < rackCount; i++) {
      const x = cx - w / 2 + 1.6 + i * ((w - 3.2) / Math.max(1, rackCount - 1));
      box(THREE, scene, "network-noc-rack", [1.1, 2.4, 1.0], [x, 1.2, backZ], rackMat);
      box(THREE, scene, "network-noc-rack-vent", [0.9, 2.0, 0.02], [x, 1.2, backZ - 0.52], ventMat);
      for (let j = 0; j < 5; j++) {
        const led = box(THREE, scene, "network-noc-rack-led", [0.06, 0.06, 0.02], [x - 0.35 + (j % 2) * 0.1, 0.6 + j * 0.32, backZ - 0.53], ledMat);
        led.castShadow = false;
        led.userData.noShadow = true;
      }
    }
    return { floor };
  }

  // ---- Sleek presenter avatar ---------------------------------------------

  function limb(THREE, mat, len, rad) {
    const g = new THREE.Group();
    const geo = new THREE.CapsuleGeometry(rad, Math.max(0.05, len - rad * 2), 6, 10);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -len / 2;
    m.castShadow = true;
    g.add(m);
    return g;
  }

  function makeMannequin(THREE) {
    const g = new THREE.Group();
    g.userData.kind = "avatar";

    const skin = new THREE.MeshStandardMaterial({ color: 0xd7a878, roughness: 0.72, metalness: 0.02 });
    const blazer = new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.62, metalness: 0.06 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.7, metalness: 0.03 });
    const trouser = new THREE.MeshStandardMaterial({ color: 0x353b45, roughness: 0.7, metalness: 0.05 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0x1a1f28, roughness: 0.5, metalness: 0.2 });
    const badge = new THREE.MeshStandardMaterial({ color: 0x0a0e14, emissive: 0x00bceb, emissiveIntensity: 0.7 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.85, metalness: 0.02 });

    // Torso — tapered blazer over a shirt V.
    const torso = new THREE.Group();
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 6, 12), blazer);
    chest.scale.set(1.15, 1, 0.7);
    chest.position.y = 1.16;
    chest.castShadow = true;
    torso.add(chest);
    const shirtV = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.34, 4, 8), shirt);
    shirtV.scale.set(1.1, 1, 0.6);
    shirtV.position.set(0, 1.2, 0.16);
    torso.add(shirtV);
    const badgeM = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.03), badge);
    badgeM.position.set(0.14, 1.02, 0.2);
    torso.add(badgeM);
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.18, 5, 10), trouser);
    hips.scale.set(1.1, 1, 0.72);
    hips.position.y = 0.82;
    hips.castShadow = true;
    torso.add(hips);
    g.add(torso);

    // Neck + head.
    const head = new THREE.Group();
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 10), skin);
    neck.position.y = 1.5;
    head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin);
    skull.scale.set(0.92, 1.05, 0.96);
    skull.position.y = 1.68;
    skull.castShadow = true;
    head.add(skull);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.205, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
    hairCap.position.y = 1.7;
    head.add(hairCap);
    g.add(head);

    // Limbs on pivots (match voxel part interface for animateAvatar()).
    const armL = limb(THREE, blazer, 0.62, 0.085); armL.position.set(-0.42, 1.4, 0);
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skin);
    handL.position.y = -0.62; armL.add(handL); g.add(armL);
    const armR = limb(THREE, blazer, 0.62, 0.085); armR.position.set(0.42, 1.4, 0);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skin);
    handR.position.y = -0.62; armR.add(handR); g.add(armR);

    const legL = limb(THREE, trouser, 0.82, 0.11); legL.position.set(-0.15, 0.82, 0);
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.34), shoe);
    shoeL.position.set(0, -0.82, 0.08); shoeL.castShadow = true; legL.add(shoeL); g.add(legL);
    const legR = limb(THREE, trouser, 0.82, 0.11); legR.position.set(0.15, 0.82, 0);
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.34), shoe);
    shoeR.position.set(0, -0.82, 0.08); shoeR.castShadow = true; legR.add(shoeR); g.add(legR);

    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData.parts = { head, torso, legL, legR, armL, armR };
    return g;
  }

  window.__DS_WALK_FX = {
    ensure, loaded, buildComposer,
    roomLightRig, nocLightRig, buildNOC, makeMannequin
  };
})();
