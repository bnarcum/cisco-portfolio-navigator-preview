/**
 * Design Studio Walk — Cable Quest mini-game (port-to-port linking in 3D)
 */
(function () {
  "use strict";

  const QUESTS = [
    {
      id: "room-bar-poe",
      title: "Cable Quest: Power the Room Bar",
      blurb: "Run Cat6 from the Room Bar LAN jack to a PoE port on the collab switch.",
      graphKind: "room",
      from: { match: /room-bar/i, port: "LAN" },
      to: { match: /c9200-collab/i, portPrefix: "Gi1/0/", requirePoe: true }
    },
    {
      id: "ceiling-mic-poe",
      title: "Cable Quest: Ceiling Mic",
      blurb: "Connect the ceiling mic ETH port to the collab switch for PoE.",
      graphKind: "room",
      from: { match: /ceiling-mic/i, port: "ETH" },
      to: { match: /c9200-collab/i, portPrefix: "Gi1/0/", requirePoe: true }
    }
  ];

  let deps = null;
  let quest = null;
  let markers = [];
  let reticlePort = null;

  function st() { return deps?.getState?.(); }

  function findPair(studio, def) {
    const roomId = studio?.activeRoomId;
    const nodes = (studio?.design?.nodes || []).filter(n => {
      if (roomId && n.roomId !== roomId) return false;
      return (n.canvas || "room") === "room";
    });
    const from = nodes.find(n => def.from.match.test(`${n.stencilId} ${n.label}`));
    const to = nodes.find(n => def.to.match.test(`${n.stencilId} ${n.label}`));
    return { from, to };
  }

  function linkExists(studio, aId, bId) {
    return (studio?.design?.links || []).some(l =>
      (l.from === aId && l.to === bId) || (l.from === bId && l.to === aId)
    );
  }

  function portLocal(ch, port, lift, scale) {
    const sx = (port.x - 0.5) * 0.55 * scale;
    let sy = lift * 0.38;
    let sz = 0.14 * scale;
    if (port.side === "bottom") sy = Math.max(0.12, lift * 0.28);
    else if (port.side === "top") sy = lift + 0.55 * scale;
    else if (port.side === "right") { sz = 0.22 * scale; sx += 0.18 * scale; }
    else if (port.side === "left") { sz = 0.22 * scale; sx -= 0.18 * scale; }
    return { x: sx, y: sy, z: sz };
  }

  function portsForChamber(ch, role) {
    const STN = window.__DS_STENCILS;
    const ports = STN?.getPorts?.(ch.stencilId, "room") || [];
    const def = QUESTS.find(q => q.id === quest?.defId);
    if (!def) return ports;
    if (role === "from") {
      return ports.filter(p => p.id === def.from.port);
    }
    if (role === "to") {
      return ports.filter(p => {
        if (!String(p.id).startsWith(def.to.portPrefix)) return false;
        if (def.to.requirePoe && !p.poe) return false;
        return true;
      });
    }
    return ports;
  }

  function clearMarkers() {
    markers.forEach(m => {
      m.parent?.remove(m);
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    });
    markers = [];
    reticlePort = null;
  }

  function attachMarkers() {
    clearMarkers();
    const state = st();
    const THREE = deps?.THREE?.();
    if (!state || !THREE || !quest) return;
    const scale = 1;
    const showOn = quest.step === 1 ? "from" : "to";
    const targetId = showOn === "from" ? quest.fromId : quest.toId;
    const ch = state.chambers?.find(c => c.id === targetId);
    const pod = state.devicePods?.find(p => p.userData?.chamber?.id === targetId);
    if (!ch || !pod) return;
    const lift = deps.podLift(ch.zone, state.graph?.kind || "room", ch);
    portsForChamber(ch, showOn).forEach(port => {
      const pos = portLocal(ch, port, lift, scale);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x44cc88, transparent: true, opacity: 0.92, depthWrite: false
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 14), mat);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData = {
        questPort: true, chamberId: ch.id, portId: port.id,
        portPoe: !!port.poe, role: showOn
      };
      pod.add(mesh);
      markers.push(mesh);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.14, 0.2, 24),
        new THREE.MeshBasicMaterial({
          color: 0xffb366, transparent: true, opacity: 0.55,
          side: THREE.DoubleSide, depthWrite: false
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, pos.y + 0.02, pos.z);
      ring.userData = { questRing: true, parentPort: mesh };
      pod.add(ring);
      markers.push(ring);
    });
  }

  function syncQuestHud() {
    const panel = document.getElementById("ds-walk-quest");
    const stepEl = document.getElementById("ds-walk-quest-step");
    const titleEl = document.getElementById("ds-walk-quest-title");
    if (!panel) return;
    if (!quest) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    if (titleEl) titleEl.textContent = quest.title;
    if (stepEl) {
      if (quest.step === 1) {
        stepEl.textContent = `Step 1 — Aim at the green port on ${quest.fromLabel} and tap or press F.`;
      } else if (quest.step === 2) {
        stepEl.textContent = `Step 2 — Connect to a PoE port on ${quest.toLabel} (Gi1/0/x).`;
      } else {
        stepEl.textContent = quest.doneMsg || "Quest complete!";
      }
    }
    const startBtn = document.querySelector(".ds-walk-hud [data-action='cable-quest']");
    if (startBtn) startBtn.hidden = !!quest;
  }

  function syncQuestButton(studio) {
    const btn = document.querySelector(".ds-walk-hud [data-action='cable-quest']");
    if (!btn) return;
    const avail = availableQuests(studio).length;
    btn.disabled = avail === 0;
    btn.title = avail
      ? "Mini-game: connect Room Bar or ceiling mic to the PoE switch"
      : "Add Room Bar + C9200 Collab SW (unlinked) to enable";

  function availableQuests(studio) {
    const state = st();
    if (!studio || state?.graph?.kind !== "room") return [];
    return QUESTS.filter(def => {
      const { from, to } = findPair(studio, def);
      if (!from || !to) return false;
      if (linkExists(studio, from.id, to.id)) return false;
      return true;
    });
  }

  function start(studio, questId) {
    const state = st();
    if (!studio || !state) return false;
    const def = QUESTS.find(q => q.id === questId) || availableQuests(studio)[0];
    if (!def) {
      deps?.setStatus?.("No cable quest available — add Room Bar + C9200 Collab SW to this room.");
      return false;
    }
    const { from, to } = findPair(studio, def);
    if (!from || !to) {
      deps?.setStatus?.("Quest needs both endpoints in the active room.");
      return false;
    }
    if (linkExists(studio, from.id, to.id)) {
      deps?.setStatus?.("Already connected — pick another quest or add devices.");
      return false;
    }
    end(false);
    quest = {
      defId: def.id,
      title: def.title,
      blurb: def.blurb,
      fromId: from.id,
      toId: to.id,
      fromLabel: from.label,
      toLabel: to.label,
      step: 1,
      pickFrom: null,
      active: true,
      startedAt: performance.now()
    };
    state.quest = quest;
    syncQuestHud();
    syncQuestButton(studio);
    attachMarkers();
    const fromCh = state.chambers?.find(c => c.id === from.id);
    if (fromCh) deps?.teleportToChamber?.(fromCh, false);
    deps?.setStatus?.(def.blurb);
    window.__DS_WALK_AUDIO?.sfx?.routeStart?.();
    return true;
  }

  function fail(msg) {
    window.__DS_WALK_AUDIO?.sfx?.questFail?.();
    deps?.setStatus?.(msg);
    const stepEl = document.getElementById("ds-walk-quest-step");
    if (stepEl) stepEl.textContent = msg;
  }

  function succeed(studio) {
    const state = st();
    const THREE = deps?.THREE?.();
    if (!quest || !studio || !state || !THREE) return;
    const { fromId, toId, pickFrom } = quest;
    const fromPort = pickFrom.portId;
    const toPort = quest.pickTo.portId;
    studio.createLink(fromId, fromPort, toId, toPort);
    const fromCh = state.chambers.find(c => c.id === fromId);
    const toCh = state.chambers.find(c => c.id === toId);
    const link = studio.design.links[studio.design.links.length - 1];
    if (fromCh && toCh && link) {
      const cor = {
        from: fromCh, to: toCh,
        media: link.media || "cat6",
        label: link.label || "Quest link",
        color: (deps.MEDIA_COLORS || {})[link.media] || 0xd4a060
      };
      const cable = deps.makeCableRun(THREE, cor);
      state.scene?.add(cable);
      state.cables.push(cable);
      state.graph?.corridors?.push(cor);
      deps?.applyPacketVisibility?.();
      deps?.buildConnectedNav?.(fromCh);
    }
    const val = window.__DS_RULES?.validateDesign?.(studio.design)
      || { poe: { load: 0, budget: 0, headroom: 0 } };
    const poe = val.poe || {};
    quest.step = 3;
    quest.doneMsg = poe.budget
      ? `Connected! PoE ${poe.load || 0}W / ${poe.budget}W · ${poe.headroom ?? 0}W headroom. Link saved to diagram.`
      : "Connected! Link saved to your room diagram.";
    syncQuestHud();
    window.__DS_WALK_AUDIO?.sfx?.questSuccess?.();
    studio.toast?.("Cable Quest complete");
    deps?.setStatus?.(quest.doneMsg);
    setTimeout(() => end(true), 4200);
  }

  function pickAt(clientX, clientY, canvas) {
    const state = st();
    if (!quest?.active || !state?.raycaster || !state.camera) return null;
    const rect = canvas.getBoundingClientRect();
    const ndc = new state.THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    state.raycaster.setFromCamera(ndc, state.camera);
    const portMeshes = markers.filter(m => m.userData?.questPort);
    const hits = state.raycaster.intersectObjects(portMeshes, false);
    return hits[0]?.object?.userData || null;
  }

  function pickReticle() {
    const state = st();
    if (!quest?.active || !state?.camera) return null;
    const forward = new state.THREE.Vector3(
      Math.sin(state.yaw) * Math.cos(state.pitch),
      Math.sin(state.pitch),
      Math.cos(state.yaw) * Math.cos(state.pitch)
    ).normalize();
    const origin = state.camera.position.clone();
    let best = null;
    let bestDot = 0.82;
    markers.filter(m => m.userData?.questPort).forEach(mesh => {
      const world = new state.THREE.Vector3();
      mesh.getWorldPosition(world);
      const to = world.clone().sub(origin);
      const dist = to.length();
      if (dist > 7) return;
      to.normalize();
      const dot = forward.dot(to);
      if (dot > bestDot) {
        bestDot = dot;
        best = mesh.userData;
      }
    });
    reticlePort = best;
    return best;
  }

  function handlePick(portData) {
    const studio = st()?.studio;
    if (!quest?.active || !portData || !studio) return false;
    const role = quest.step === 1 ? "from" : "to";
    if (portData.role !== role) {
      fail(role === "from"
        ? "Pick the endpoint port on the codec/bar first."
        : "Now pick a PoE port on the collab switch.");
      return true;
    }
    if (quest.step === 1) {
      quest.pickFrom = { chamberId: portData.chamberId, portId: portData.portId };
      quest.step = 2;
      attachMarkers();
      syncQuestHud();
      const toCh = st()?.chambers?.find(c => c.id === quest.toId);
      if (toCh) deps?.teleportToChamber?.(toCh, false);
      window.__DS_WALK_AUDIO?.sfx?.inspect?.();
      deps?.setStatus?.(`Good — now connect to ${quest.toLabel}.`);
      return true;
    }
    if (quest.step === 2) {
      quest.pickTo = { chamberId: portData.chamberId, portId: portData.portId };
      succeed(studio);
      return true;
    }
    return false;
  }

  function tick(t) {
    if (!quest?.active) return;
    const pulse = 0.65 + 0.35 * Math.sin(t * 3.2);
    markers.forEach(m => {
      if (m.userData?.questPort) {
        m.material.opacity = 0.55 + 0.4 * pulse;
        m.scale.setScalar(0.9 + 0.15 * pulse);
      }
      if (m.userData?.questRing) {
        m.material.opacity = 0.35 + 0.3 * pulse;
        m.rotation.z = t * 0.8;
      }
    });
    pickReticle();
    const prompt = document.getElementById("ds-walk-prompt");
    if (prompt && quest.step < 3) {
      prompt.hidden = false;
      prompt.textContent = reticlePort
        ? `Tap or press F — connect ${reticlePort.portId}`
        : "Aim at the glowing port";
    }
  }

  function end(completed) {
    clearMarkers();
    const state = st();
    if (state) state.quest = null;
    quest = null;
    reticlePort = null;
    syncQuestHud();
    syncQuestButton(st()?.studio);
    const startBtn = document.querySelector(".ds-walk-hud [data-action='cable-quest']");
    if (startBtn) startBtn.hidden = false;
    if (!completed) deps?.setStatus?.("Cable Quest cancelled");
  }

  function isActive() { return !!quest?.active; }

  function reticlePick() { return reticlePort; }

  function register(d) { deps = d; }

  window.__DS_WALK_QUEST = {
    register, start, end, tick, pickAt, handlePick, isActive,
    reticlePick, availableQuests, syncQuestButton, QUESTS
  };
})();
