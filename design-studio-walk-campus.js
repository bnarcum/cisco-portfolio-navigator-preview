/**
 * Design Studio Walk — campus journey waypoints + validation halos
 */
(function () {
  "use strict";

  const VALIDATE_KEY = "cpn-ds-walk-validate";
  let deps = null;
  let journey = null;

  function st() { return deps?.getState?.(); }

  function validateEnabled() {
    try {
      const v = localStorage.getItem(VALIDATE_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
    } catch (e) { /* ignore */ }
    return true;
  }

  function setValidateEnabled(on) {
    try { localStorage.setItem(VALIDATE_KEY, on ? "1" : "0"); } catch (e) { /* ignore */ }
    syncValidateHud();
    syncValidationHalos();
  }

  function toggleValidate() {
    setValidateEnabled(!validateEnabled());
    deps?.setStatus?.(validateEnabled()
      ? "Validation halos on — errors glow red"
      : "Validation halos off");
  }

  function syncValidateHud() {
    const btn = document.querySelector('.ds-walk-hud [data-action="validate-toggle"]');
    if (!btn) return;
    const on = validateEnabled();
    btn.classList.toggle("active", on);
    btn.textContent = on ? "Validate: on" : "Validate";
  }

  function errorNodeIds(design) {
    const map = window.__DS_RULES?.nodeIssues?.(design) || {};
    const ids = new Set();
    Object.entries(map).forEach(([id, v]) => {
      if (v?.severity === "error") ids.add(id);
    });
    (window.__DS_RULES?.validateDesign?.(design)?.warnings || []).forEach(w => {
      if (w.severity !== "error") return;
      const m = String(w.id || "").match(/^room-poe-(.+)$/);
      if (m) ids.add(m[1]);
    });
    return ids;
  }

  function syncValidationHalos() {
    const state = st();
    if (!state?.devicePods) return;
    state.devicePods.forEach(pod => {
      if (pod.userData?.validateRing) {
        pod.remove(pod.userData.validateRing);
        pod.userData.validateRing.geometry?.dispose?.();
        pod.userData.validateRing.material?.dispose?.();
        pod.userData.validateRing = null;
      }
    });
    if (!validateEnabled()) return;
    const design = state.studio?.design;
    const THREE = deps?.THREE?.();
    if (!design || !THREE) return;
    const errs = errorNodeIds(design);
    if (!errs.size) return;
    state.devicePods.forEach(pod => {
      const ch = pod.userData?.chamber;
      if (!ch || !errs.has(ch.id)) return;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 1.08, 36),
        new THREE.MeshBasicMaterial({
          color: 0xff3344, transparent: true, opacity: 0.82,
          side: THREE.DoubleSide, depthWrite: false
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.14;
      pod.add(ring);
      pod.userData.validateRing = ring;
    });
  }

  function pulseValidationHalos(t) {
    const state = st();
    if (!validateEnabled() || !state?.devicePods) return;
    state.devicePods.forEach(pod => {
      const ring = pod.userData?.validateRing;
      if (!ring?.material) return;
      ring.material.opacity = 0.55 + 0.28 * Math.sin(t * 3.2 + (pod.id || 0));
      ring.scale.setScalar(1 + 0.06 * Math.sin(t * 2.4));
    });
  }

  function findJourneyStops(chambers) {
    const net = chambers.filter(c => c.campusPart === "network" || !c.campusPart);
    const room = chambers.filter(c => c.campusPart === "room");
    const pick = (list, pred) => list.find(pred);
    const core = pick(net, c => c.zone === "core" || /core|9500|9400/i.test(c.label || ""))
      || pick(net, c => c.zone === "distribution")
      || pick(net, c => /dist/i.test(c.label || ""));
    const access = pick(net, c => /collab|c9200-collab/i.test(c.stencilId || ""))
      || pick(net, c => c.zone === "collab" || c.zone === "access")
      || pick(net, c => /9200|9300|switch/i.test(c.label || ""));
    const roomEntry = pick(room, c => /kit|bar|codec|board|touch/i.test(c.stencilId || c.label || ""))
      || pick(room, c => c.zone === "table" || c.zone === "rack")
      || room[0];
    return [core, access, roomEntry].filter(Boolean);
  }

  function startJourney() {
    const state = st();
    if (!state?.graph || state.graph.kind !== "campus") {
      deps?.setStatus?.("Campus journey needs network + room in one walk");
      return;
    }
    const stops = findJourneyStops(state.chambers || []);
    if (stops.length < 2) {
      deps?.setStatus?.("Not enough stops for a campus journey");
      return;
    }
    journey = { stops, idx: 0 };
    deps?.setStatus?.(`Campus journey · ${stops.length} stops — follow the route`);
    deps?.beginGuidedRoute?.(stops[0]);
  }

  function onArrive(destId) {
    if (!journey || !destId) return;
    const cur = journey.stops[journey.idx];
    if (!cur || cur.id !== destId) return;
    if (journey.idx >= journey.stops.length - 1) {
      journey = null;
      deps?.setStatus?.("Campus journey complete");
      return;
    }
    journey.idx += 1;
    const next = journey.stops[journey.idx];
    deps?.setStatus?.(`Next stop · ${next.label}`);
    setTimeout(() => deps?.beginGuidedRoute?.(next), 2400);
  }

  function cancelJourney() {
    journey = null;
  }

  function register(api) {
    deps = api;
  }

  window.__DS_WALK_CAMPUS = {
    register,
    toggleValidate,
    syncValidateHud,
    syncValidationHalos,
    pulseValidationHalos,
    startJourney,
    onArrive,
    cancelJourney,
    validateEnabled,
    findJourneyStops
  };
})();
