/**
 * Design Studio Walk — Layout mode: drag devices on the floor, sync to diagram.
 */
(function () {
  "use strict";

  let deps = null;
  const layout = { active: false, drag: null, selectedId: null };
  const _plane = { plane: null };
  const _hit = { v: null };

  function st() { return deps?.getState?.(); }

  function floorHit(clientX, clientY, canvas) {
    const state = st();
    const THREE = deps?.THREE?.();
    if (!state?.raycaster || !state.camera || !THREE) return null;
    const rect = canvas.getBoundingClientRect();
    state.raycaster.setFromCamera(new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    ), state.camera);
    if (!_plane.plane) _plane.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (!_hit.v) _hit.v = new THREE.Vector3();
    const pt = state.raycaster.ray.intersectPlane(_plane.plane, _hit.v);
    if (!pt) return null;
    const topo = state.topology;
    let x = _hit.v.x;
    let z = _hit.v.z;
    if (topo?.isWalkable) {
      const snap = deps.snapToWalkable?.(x, z) || { x, z };
      x = snap.x;
      z = snap.z;
    }
    const b = state.bounds;
    if (b) {
      x = Math.max(b.minX + 1, Math.min(b.maxX - 1, x));
      z = Math.max(b.minZ + 1, Math.min(b.maxZ - 1, z));
    }
    return { x, z };
  }

  function podForChamber(chId) {
    const state = st();
    return state?.devicePods?.find(p => p.userData?.chamber?.id === chId) || null;
  }

  function movePod(ch, wx, wz) {
    const pod = podForChamber(ch.id);
    if (pod) pod.position.set(wx, 0, wz);
    ch.pos.x = wx;
    ch.pos.z = wz;
    const col = st()?.colliders?.find(c => c.id === ch.id);
    if (col) { col.x = wx; col.z = wz; }
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

  function commitPosition(ch, wx, wz) {
    const state = st();
    const studio = state?.studio;
    if (!studio || !state.graph) return;
    window.__DS_WALK_LAYOUT?.syncNodeFromWorld?.(studio, ch.id, wx, wz, state.graph);
    studio.pushHistory();
    studio.render();
    refreshCablesFor(ch.id);
    deps.buildConnectedNav?.(ch);
    deps.setStatus?.(`Placed ${ch.label} — diagram updated`);
  }

  function syncHud() {
    const btn = document.querySelector('.ds-walk-hud [data-action="layout-toggle"]');
    if (!btn) return;
    btn.classList.toggle("active", layout.active);
    btn.textContent = layout.active ? "Layout: on" : "Layout";
    st()?.overlay?.classList.toggle("ds-walk-layout-mode", layout.active);
  }

  function toggle() {
    layout.active = !layout.active;
    layout.drag = null;
    if (!layout.active) layout.selectedId = null;
    syncHud();
    deps.setStatus?.(layout.active
      ? "Layout mode — drag devices on the floor (G to exit)"
      : "Walk mode — WASD to move");
  }

  function cancelDrag() {
    const d = layout.drag;
    if (!d) return;
    movePod(d.ch, d.startX, d.startZ);
    layout.drag = null;
  }

  function handleDown(e, canvas, pickDeviceAt) {
    if (!layout.active || e.button !== 0) return false;
    const ch = pickDeviceAt(e.clientX, e.clientY, canvas) || st()?.reticleChamber;
    if (!ch) return false;
    e.preventDefault();
    e.stopPropagation();
    layout.selectedId = ch.id;
    layout.drag = {
      ch,
      startX: ch.pos.x,
      startZ: ch.pos.z,
      moved: false
    };
    const pod = podForChamber(ch.id);
    if (pod?.userData?.ring?.material) pod.userData.ring.material.opacity = 0.45;
    deps.setStatus?.(`Dragging ${ch.label} — release to place`);
    return true;
  }

  function handleMove(e, canvas) {
    if (!layout.drag) return false;
    const hit = floorHit(e.clientX, e.clientY, canvas);
    if (!hit) return true;
    layout.drag.moved = true;
    movePod(layout.drag.ch, hit.x, hit.z);
    return true;
  }

  function handleUp() {
    if (!layout.drag) return false;
    const { ch, startX, startZ, moved } = layout.drag;
    const pod = podForChamber(ch.id);
    if (pod?.userData?.ring?.material) pod.userData.ring.material.opacity = 0.1;
    if (moved && (Math.abs(ch.pos.x - startX) > 0.05 || Math.abs(ch.pos.z - startZ) > 0.05)) {
      commitPosition(ch, ch.pos.x, ch.pos.z);
    }
    layout.drag = null;
    return true;
  }

  function placeNodeAtWorld(nodeId, wx, wz) {
    const state = st();
    const ch = state?.chambers?.find(c => c.id === nodeId);
    if (!ch) return;
    movePod(ch, wx, wz);
    commitPosition(ch, wx, wz);
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
    handleDown,
    handleMove,
    handleUp,
    onKeyDown,
    placeNodeAtWorld,
    isActive,
    isDragging
  };
})();
