/**
 * Design Studio Walk — Layout mode: kind-aware drag surfaces, diagram sync.
 */
(function () {
  "use strict";

  let deps = null;
  const layout = {
    active: false,
    drag: null,
    selectedId: null,
    ghost: null,
    savedCam: null,
    orbit: false,
    orbitLast: null,
    renderTimer: null
  };
  const _plane = { plane: null, normal: null };
  const _hit = { v: null };
  const SNAP_GRID = 0.25;

  function st() { return deps?.getState?.(); }
  function L() { return window.__DS_WALK_LAYOUT; }

  function raycastNdc(clientX, clientY, canvas) {
    const state = st();
    if (!state?.raycaster || !state.camera) return null;
    const rect = canvas.getBoundingClientRect();
    state.raycaster.setFromCamera(new state.THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    ), state.camera);
    return state.raycaster;
  }

  function intersectPlane(clientX, clientY, canvas, planeY, planeZ) {
    const THREE = deps?.THREE?.();
    const raycaster = raycastNdc(clientX, clientY, canvas);
    if (!raycaster || !THREE) return null;
    if (!_plane.normal) _plane.normal = new THREE.Vector3();
    if (!_hit.v) _hit.v = new THREE.Vector3();
    if (planeZ != null) {
      _plane.normal.set(0, 0, 1);
      _plane.plane = new THREE.Plane(_plane.normal, -planeZ);
    } else {
      _plane.normal.set(0, 1, 0);
      _plane.plane = new THREE.Plane(_plane.normal, -planeY);
    }
    const pt = raycaster.ray.intersectPlane(_plane.plane, _hit.v);
    if (!pt) return null;
    return { x: _hit.v.x, y: _hit.v.y, z: _hit.v.z };
  }

  function clampBounds(x, z) {
    const b = st()?.bounds;
    if (!b) return { x, z };
    return {
      x: Math.max(b.minX + 0.6, Math.min(b.maxX - 0.6, x)),
      z: Math.max(b.minZ + 0.6, Math.min(b.maxZ - 0.6, z))
    };
  }

  function softSnap(x, z, shiftKey) {
    if (shiftKey) return { x, z };
    return {
      x: Math.round(x / SNAP_GRID) * SNAP_GRID,
      z: Math.round(z / SNAP_GRID) * SNAP_GRID
    };
  }

  /** Kind-aware raycast: table / wall / ceiling / rack / network floor. */
  function placementHit(clientX, clientY, canvas, ch, opts = {}) {
    const state = st();
    const graph = state?.graph;
    const frame = graph?.semanticFrame;
    if (!frame || !ch) return floorHit(clientX, clientY, canvas, opts);

    const prof = L()?.placementProfile?.(ch) || { surface: "floor" };
    let hit = null;

    if (graph.kind === "network") {
      hit = intersectPlane(clientX, clientY, canvas, 0, null);
      if (!hit) return null;
      const layer = L()?.inferNetworkLayer?.(hit.z, frame) || ch.zone || "access";
      const c = L()?.constrainNetworkWorld?.(hit.x, hit.z, layer, frame) || hit;
      return { x: c.x, y: ch.pos?.y || 1.05, z: c.z, surface: "network", zone: layer };
    }

    if (prof.surface === "wall") {
      hit = intersectPlane(clientX, clientY, canvas, null, frame.frontZ + 0.15);
    } else if (prof.surface === "ceiling") {
      hit = intersectPlane(clientX, clientY, canvas, 2.85, null);
    } else if (prof.surface === "rack") {
      hit = intersectPlane(clientX, clientY, canvas, null, frame.credenzaZ - 1);
    } else {
      hit = intersectPlane(clientX, clientY, canvas, ch.pos?.y || 0.82, null);
    }
    if (!hit) return null;

    const kind = L()?.deviceKind?.(ch.stencilId, ch.label, ch.zone);
    const zone = L()?.inferZoneFromWorld?.(hit.x, hit.z, kind, frame) || ch.zone;
    const c2 = L()?.clampToVolume?.(hit.x, hit.z, zone, frame) || { x: hit.x, z: hit.z };
    return {
      x: c2.x,
      y: hit.y,
      z: c2.z,
      surface: prof.surface,
      zone
    };
  }

  function floorHit(clientX, clientY, canvas, opts = {}) {
    const hit = intersectPlane(clientX, clientY, canvas, 0, null);
    if (!hit) return null;
    let { x, z } = hit;
    if (!opts.forLayout && st()?.topology?.isWalkable) {
      const snap = deps.snapToWalkable?.(x, z) || { x, z };
      x = snap.x;
      z = snap.z;
    }
    return clampBounds(x, z);
  }

  function podForChamber(chId) {
    return st()?.devicePods?.find(p => p.userData?.chamber?.id === chId) || null;
  }

  function updatePodTransform(ch) {
    const pod = podForChamber(ch.id);
    if (!pod) return;
    pod.position.set(ch.pos.x, 0, ch.pos.z);
    pod.rotation.y = deps.podFaceYaw?.(ch) ?? pod.rotation.y;
    const col = st()?.colliders?.find(c => c.id === ch.id);
    if (col) {
      col.x = ch.pos.x;
      col.z = ch.pos.z;
    }
  }

  function previewPosition(ch, hit, shiftKey) {
    const state = st();
    const graph = state?.graph;
    const studio = state?.studio;
    if (!graph || !studio) return;

    let wx = hit.x + (layout.drag?.offsetX || 0);
    let wz = hit.z + (layout.drag?.offsetZ || 0);
    const snapped = softSnap(wx, wz, shiftKey);
    wx = snapped.x;
    wz = snapped.z;

    const result = L()?.syncNodeFromWorld?.(studio, ch.id, wx, wz, graph, { wy: hit.y, preview: true });
    if (result?.ch) {
      Object.assign(ch, result.ch);
      updatePodTransform(ch);
    }
    updateGhost(ch);
    updateCollisionRing(ch);
    scheduleDiagramRender(studio);
    const zoneLabel = result?.placement?.zone || ch.zone || "device";
    deps.setStatus?.(`Placing ${ch.label} · ${zoneLabel} · Shift = free snap`);
  }

  function scheduleDiagramRender(studio) {
    if (layout.renderTimer) return;
    layout.renderTimer = setTimeout(() => {
      layout.renderTimer = null;
      studio?.render?.({ skipHistory: true });
    }, 80);
  }

  function ensureGhost() {
    const THREE = deps?.THREE?.();
    const scene = st()?.scene;
    if (!THREE || !scene) return;
    if (layout.ghost) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.62, 40),
      new THREE.MeshBasicMaterial({ color: 0x78dc96, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.name = "ds-layout-ghost";
    layout.ghost = ring;
    scene.add(ring);
  }

  function updateGhost(ch) {
    ensureGhost();
    if (!layout.ghost || !ch?.pos) return;
    layout.ghost.position.set(ch.pos.x, 0.04, ch.pos.z);
    layout.ghost.visible = !!layout.drag;
  }

  function updateCollisionRing(ch) {
    const pod = podForChamber(ch.id);
    const graph = st()?.graph;
    if (!pod?.userData?.ring || !graph) return;
    const sep = L()?.minSeparationAt?.(graph.chambers, ch.id, ch.pos.x, ch.pos.z, graph.kind);
    const ok = sep?.ok !== false;
    pod.userData.ring.material.color.setHex(ok ? 0x78dc96 : 0xff6644);
    pod.userData.ring.material.opacity = layout.drag ? 0.5 : 0.1;
  }

  function removeGhost() {
    if (!layout.ghost) return;
    st()?.scene?.remove(layout.ghost);
    layout.ghost.geometry?.dispose?.();
    layout.ghost.material?.dispose?.();
    layout.ghost = null;
  }

  function refreshCablesFor(chId) {
    const state = st();
    const THREE = deps?.THREE?.();
    if (!state?.scene || !THREE) return;
    const keep = [];
    state.cables.forEach(g => {
      const cor = g.userData?.corridor;
      if (cor && (cor.from?.id === chId || cor.to?.id === chId)) {
        state.scene.remove(g);
        g.traverse(o => {
          o.geometry?.dispose?.();
          const m = o.material;
          if (Array.isArray(m)) m.forEach(x => x?.dispose?.());
          else m?.dispose?.();
        });
      } else keep.push(g);
    });
    state.cables = keep;
    (state.graph?.corridors || []).forEach(cor => {
      if (cor.from?.id !== chId && cor.to?.id !== chId) return;
      state.scene.add(deps.makeCableRun(THREE, cor));
    });
    deps.applyPacketVisibility?.();
  }

  function commitPosition(ch) {
    const state = st();
    const studio = state?.studio;
    if (!studio || !state.graph) return;
    L()?.reapplyChamberSemantics?.(studio, state.graph, ch.id);
    updatePodTransform(ch);
    studio.pushHistory();
    studio.render();
    refreshCablesFor(ch.id);
    deps.buildConnectedNav?.(ch);
    const zone = ch.zone || "device";
    deps.setStatus?.(`Placed ${ch.label} in ${zone} — diagram updated`);
  }

  function enterLayoutCamera() {
    const state = st();
    if (!state || layout.savedCam) return;
    layout.savedCam = { yaw: state.yaw, pitch: state.pitch, pos: { ...state.pos } };
    state.pitch = Math.max(-1.15, state.pitch - 0.35);
    deps.applyCamera?.();
  }

  function exitLayoutCamera() {
    const state = st();
    if (!state || !layout.savedCam) return;
    state.yaw = layout.savedCam.yaw;
    state.pitch = layout.savedCam.pitch;
    layout.savedCam = null;
    deps.applyCamera?.();
  }

  function syncHud() {
    const btn = document.querySelector('.ds-walk-hud [data-action="layout-toggle"]');
    const overlay = st()?.overlay;
    if (btn) {
      btn.classList.toggle("active", layout.active);
      btn.textContent = layout.active ? "Layout: on" : "Layout";
    }
    overlay?.classList.toggle("ds-walk-layout-mode", layout.active);
    const hint = document.getElementById("ds-walk-layout-hint");
    if (hint) hint.hidden = !layout.active;
  }

  function toggle() {
    layout.active = !layout.active;
    layout.drag = null;
    layout.orbit = false;
    if (!layout.active) {
      layout.selectedId = null;
      removeGhost();
      exitLayoutCamera();
    } else {
      enterLayoutCamera();
      ensureGhost();
    }
    syncHud();
    deps.setStatus?.(layout.active
      ? "Layout — drag on table, wall, or ceiling; Shift = fine placement; Esc exit"
      : "Walk mode — WASD to move");
  }

  function cancelDrag() {
    const d = layout.drag;
    if (!d) return;
    const ch = d.ch;
    const studio = st()?.studio;
    ch.pos.x = d.startX;
    ch.pos.z = d.startZ;
    ch.pos.y = d.startY;
    ch.zone = d.startZone;
    ch.relX = d.startRelX;
    ch.relY = d.startRelY;
    if (d.startNode && studio) {
      const node = studio.design?.nodes?.find(n => n.id === ch.id);
      if (node) {
        node.x = d.startNode.x;
        node.y = d.startNode.y;
        node.walkPlacement = d.startNode.walkPlacement
          ? { ...d.startNode.walkPlacement } : undefined;
        if (!d.startNode.walkPlacement) delete node.walkPlacement;
      }
    }
    L()?.reapplyChamberSemantics?.(studio, st()?.graph, ch.id);
    updatePodTransform(ch);
    studio?.render?.();
    layout.drag = null;
    removeGhost();
  }

  function handleDown(e, canvas, pickDeviceAt) {
    if (!layout.active) return false;
    if (e.button === 1) {
      layout.orbit = true;
      layout.orbitLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return true;
    }
    if (e.button !== 0) return false;

    const ch = pickDeviceAt(e.clientX, e.clientY, canvas) || st()?.reticleChamber;
    if (!ch) return false;
    e.preventDefault();
    e.stopPropagation();

    const hit = placementHit(e.clientX, e.clientY, canvas, ch, { shiftKey: e.shiftKey })
      || floorHit(e.clientX, e.clientY, canvas, { forLayout: true });
    if (!hit) return false;

    const node = studio.design?.nodes?.find(n => n.id === ch.id);
    layout.selectedId = ch.id;
    layout.drag = {
      ch,
      offsetX: ch.pos.x - hit.x,
      offsetZ: ch.pos.z - hit.z,
      startX: ch.pos.x,
      startZ: ch.pos.z,
      startY: ch.pos.y,
      startZone: ch.zone,
      startRelX: ch.relX,
      startRelY: ch.relY,
      startNode: node ? { x: node.x, y: node.y, walkPlacement: node.walkPlacement ? { ...node.walkPlacement } : null } : null,
      moved: false
    };
    updateCollisionRing(ch);
    deps.setStatus?.(`Dragging ${ch.label} — release to place`);
    return true;
  }

  function handleMove(e, canvas) {
    if (layout.orbit && layout.orbitLast) {
      const state = st();
      if (state) {
        const dx = e.clientX - layout.orbitLast.x;
        const dy = e.clientY - layout.orbitLast.y;
        state.yaw += dx * 0.004;
        state.pitch = Math.max(-1.2, Math.min(0.1, state.pitch - dy * 0.004));
        deps.applyCamera?.();
      }
      layout.orbitLast = { x: e.clientX, y: e.clientY };
      return true;
    }
    if (!layout.drag) return false;
    const ch = layout.drag.ch;
    const hit = placementHit(e.clientX, e.clientY, canvas, ch, { shiftKey: e.shiftKey })
      || floorHit(e.clientX, e.clientY, canvas, { forLayout: true });
    if (!hit) return true;
    layout.drag.moved = true;
    previewPosition(ch, hit, e.shiftKey);
    return true;
  }

  function handleUp(e) {
    if (layout.orbit) {
      layout.orbit = false;
      layout.orbitLast = null;
      return true;
    }
    if (!layout.drag) return false;
    const { ch, startX, startZ, moved } = layout.drag;
    removeGhost();
    if (moved && (Math.abs(ch.pos.x - startX) > 0.03 || Math.abs(ch.pos.z - startZ) > 0.03)) {
      commitPosition(ch);
    }
    layout.drag = null;
    return true;
  }

  function placeNodeAtWorld(nodeId, wx, wz, stencilId) {
    const state = st();
    const ch = state?.chambers?.find(c => c.id === nodeId);
    if (!ch) return;
    const frame = state.graph?.semanticFrame;
    if (frame && stencilId) {
      const kind = L()?.deviceKind?.(stencilId, ch.label, ch.zone);
      const zone = L()?.defaultZoneForKind?.(kind) || "table";
      const rel = { zone, relX: 0.5, relY: 0.5 };
      L()?.applyChamberFromPlacement?.(ch, rel, frame);
      wx = ch.pos.x;
      wz = ch.pos.z;
    }
    const hit = { x: wx, y: ch.pos?.y, z: wz };
    previewPosition(ch, hit, false);
    commitPosition(ch);
  }

  function onKeyDown(e) {
    if (!layout.active) return false;
    if (e.key === "Escape") {
      cancelDrag();
      toggle();
      e.preventDefault();
      return true;
    }
    return false;
  }

  function register(api) {
    deps = api;
  }

  function isActive() { return layout.active; }
  function isDragging() { return !!layout.drag; }

  window.__DS_WALK_LAYOUT_MODE = {
    register,
    toggle,
    syncHud,
    floorHit,
    placementHit,
    handleDown,
    handleMove,
    handleUp,
    onKeyDown,
    placeNodeAtWorld,
    isActive,
    isDragging
  };
})();
