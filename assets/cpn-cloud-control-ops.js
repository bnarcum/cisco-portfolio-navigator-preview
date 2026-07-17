/**
 * Cloud Control / AI Canvas operations model (demo data).
 *
 * Shared by:
 *  - the main app product/family panels (Operations · Cloud Control section)
 *  - cloud-control-briefing.html (mock Command Center)
 *
 * This is curated, illustrative metadata — NOT live telemetry. It maps portfolio
 * families to the operational face they'd have inside Cisco Cloud Control:
 * Control Hub admin, ThousandEyes/observability signals, and AI Canvas
 * cross-domain investigation scenarios.
 */
(function () {
  "use strict";

  // Cross-domain AgenticOps scenarios. Families reference these by id so the
  // same investigation can surface from multiple products.
  const SCENARIOS = {
    "room-qoe": {
      title: "Boardroom video quality degradation",
      severity: "critical",
      domains: ["collaboration", "network"],
      question: "Why is video choppy in the Executive Boardroom right now?",
      prompt:
        "Correlate Webex room device health (RoomOS) with WAN path quality for the affected boardrooms, then recommend a remediation that keeps the meeting running.",
      metric: { label: "Packet loss — branch uplink", unit: "%", peak: 9.4, baseline: 0.3 },
      topology: { nodes: ["Boardroom codec", "Room AP", "Branch MX", "SD-WAN edge", "Webex cloud"], degraded: 2 },
      hypotheses: [
        "WAN path loss on the branch uplink is starving the video stream",
        "RoomOS firmware drift on the codec is causing packet reordering",
        "Wi-Fi contention in the room is degrading the wireless share channel"
      ],
      evidence: [
        "ThousandEyes: packet loss ↑ on branch → cloud path",
        "Control Hub: codec media quality below threshold",
        "Meraki: AP channel utilization high during meeting window"
      ],
      impact: "4 boardrooms · ~12 active participants · exec briefing at risk",
      action:
        "Apply SD-WAN app-aware policy to prioritize media, schedule RoomOS update, and fail the room over to the secondary path."
    },
    "calling-registration": {
      title: "Webex Calling registration flapping",
      severity: "warning",
      domains: ["collaboration", "network"],
      question: "Phones at the Denver site keep dropping registration — what's going on?",
      prompt:
        "Investigate intermittent Webex Calling device registration loss and identify whether it is network, identity, or service-side.",
      metric: { label: "Registration drops — Denver site", unit: "/min", peak: 14, baseline: 0 },
      topology: { nodes: ["IP phones", "Access switch", "Branch firewall", "DNS", "Calling edge"], degraded: 2 },
      hypotheses: [
        "Branch firewall is aging out SIP sessions too aggressively",
        "DNS resolution latency to the calling edge is spiking",
        "Certificate rotation on a subset of devices failed"
      ],
      evidence: [
        "Control Hub: registration drop events clustered by site",
        "ThousandEyes: DNS + HTTP test latency ↑ to calling edge",
        "Secure Firewall: short-lived SIP flows being reset"
      ],
      impact: "1 site · ~40 phones · inbound calls intermittently failing",
      action:
        "Tune firewall SIP timers, pin calling edge via closest region, and reissue certs to affected devices."
    },
    "wan-brownout": {
      title: "Branch WAN brownout",
      severity: "warning",
      domains: ["network"],
      question: "Users at the Austin branch say every app is slow — is it the network?",
      prompt:
        "Determine root cause of degraded application experience at a branch and whether SD-WAN can steer around it.",
      metric: { label: "Latency — primary circuit", unit: "ms", peak: 480, baseline: 42 },
      topology: { nodes: ["Branch users", "Catalyst switch", "SD-WAN edge", "MPLS circuit", "SaaS / cloud"], degraded: 3 },
      hypotheses: [
        "Primary MPLS/Internet circuit is experiencing loss/jitter",
        "A noisy application is saturating the uplink",
        "Upstream ISP peering issue outside the enterprise"
      ],
      evidence: [
        "ThousandEyes: loss/latency ↑ on primary path, secondary clean",
        "Catalyst Center: interface utilization at capacity",
        "Meraki MX: SD-WAN health scores dropped for primary"
      ],
      impact: "Branch of ~60 users · SaaS + voice affected",
      action:
        "Steer critical apps to the healthy path via SD-WAN policy and open a provider ticket with TE evidence."
    },
    "dc-ai-fabric": {
      title: "AI fabric congestion impacting training job",
      severity: "critical",
      domains: ["compute", "network"],
      question: "Our GPU training job stalled — is the fabric the bottleneck?",
      prompt:
        "Correlate Nexus fabric telemetry with GPU job performance and recommend a fix that protects the AI workload.",
      metric: { label: "ECN marks — leaf-07", unit: "k/s", peak: 62, baseline: 2 },
      topology: { nodes: ["GPU nodes", "Leaf-07", "Spine", "Leaf-12", "Storage"], degraded: 1 },
      hypotheses: [
        "East-west congestion on a leaf switch is throttling RDMA traffic",
        "A failed optic is forcing traffic onto a degraded path",
        "QoS policy is not protecting the training class of traffic"
      ],
      evidence: [
        "Nexus Dashboard: buffer/ECN marking ↑ on a leaf",
        "Intersight: GPU node utilization stalling during checkpoints",
        "Fabric telemetry: link errors on one uplink"
      ],
      impact: "1 training cluster · job throughput down ~30%",
      action:
        "Rebalance flows off the degraded link, replace the optic, and enforce the AI traffic QoS class."
    },
    "security-anomaly": {
      title: "Cross-domain security anomaly",
      severity: "critical",
      domains: ["security", "network"],
      question: "XDR flagged a host beaconing out — is this an active compromise?",
      prompt:
        "Investigate an anomaly spanning identity, network, and endpoint and propose a contained response.",
      metric: { label: "Anomalous outbound flows", unit: "/min", peak: 37, baseline: 1 },
      topology: { nodes: ["Endpoint", "Access switch", "ISE", "Secure Firewall", "Internet C2"], degraded: 3 },
      hypotheses: [
        "Compromised credential performing lateral movement",
        "Misconfigured access policy exposing a segment",
        "Beaconing endpoint indicating C2 activity"
      ],
      evidence: [
        "XDR: correlated detections across endpoint + network",
        "ISE/Duo: anomalous auth from new device/location",
        "Secure Firewall: outbound to low-reputation destination"
      ],
      impact: "Potential lateral movement · 1 user, 2 hosts",
      action:
        "Quarantine host via ISE, force re-auth with Duo, and open an AI Canvas investigation with SOC agents."
    },
    "observability-gap": {
      title: "Observability coverage gap",
      severity: "warning",
      domains: ["observability"],
      question: "Where are we blind? Show telemetry gaps across the estate.",
      prompt:
        "Identify where the estate lacks telemetry so cross-domain investigations are not blind, and recommend agents/tests to deploy.",
      metric: { label: "Sites without TE agent", unit: "", peak: 6, baseline: 6 },
      topology: { nodes: ["Site A", "Site B", "Site C ⚠", "App Y ⚠", "Core"], degraded: 2 },
      hypotheses: [
        "Key branch has no ThousandEyes agent",
        "A critical app has no APM/RUM instrumentation",
        "Device inventory in Control Hub is incomplete"
      ],
      evidence: [
        "ThousandEyes: no enterprise agent at site X",
        "FSO/Splunk: missing OTel spans for app Y",
        "Control Hub: unmanaged devices detected"
      ],
      impact: "Blind spots slow every future investigation",
      action:
        "Deploy TE agents to uncovered sites, instrument app Y, and reconcile Control Hub inventory."
    }
  };

  // Domain → the agent persona that investigates it (name + accent).
  const DOMAIN_AGENTS = {
    network: { name: "Network Agent", short: "NET", color: "#02c8ff" },
    collaboration: { name: "Collaboration Agent", short: "COL", color: "#2dce5c" },
    security: { name: "Security Agent", short: "SEC", color: "#ff4d6d" },
    compute: { name: "Compute Agent", short: "CMP", color: "#0a60ff" },
    observability: { name: "Observability Agent", short: "OBS", color: "#ff9000" }
  };

  const CONTROL_HUB = { label: "Control Hub", url: "https://admin.webex.com" };
  const CLOUD = { label: "Cloud Control", url: "https://cloud.cisco.com" };
  const DCLOUD_AGENTICOPS =
    "https://dcloud2-rtp.cisco.com/content/instantdemo/agenticops-with-cisco-cloud-control?returnPathTitleKey=content-view";

  // Family → operational profile. Only families with a Cloud Control adjacency
  // are listed; everything else returns null (keeps unrelated panels clean).
  const FAMILY_OPS = {
    "cloud-control": {
      role: "platform",
      domains: ["collaboration", "network", "security", "observability"],
      admin: CLOUD,
      scenario: "room-qoe",
      learningId: "wa-cloud-control",
      dcloud: DCLOUD_AGENTICOPS,
      note: "The AgenticOps platform itself — unified inventory, topology, correlated alerts, and AI Canvas."
    },
    "room-systems": {
      domains: ["collaboration", "network"],
      admin: CONTROL_HUB,
      observability: { product: "ThousandEyes", hint: "Meeting quality + path tests to the media edge" },
      scenario: "room-qoe",
      learningId: "wa-cloud-control",
      dcloud: DCLOUD_AGENTICOPS
    },
    "desk-devices": {
      domains: ["collaboration"],
      admin: CONTROL_HUB,
      scenario: "room-qoe",
      learningId: "wa-cloud-control"
    },
    "webex-app": {
      domains: ["collaboration"],
      admin: CONTROL_HUB,
      scenario: "calling-registration",
      learningId: "wa-cloud-control",
      dcloud: DCLOUD_AGENTICOPS
    },
    "webex-calling": {
      domains: ["collaboration", "network"],
      admin: CONTROL_HUB,
      observability: { product: "ThousandEyes", hint: "DNS/HTTP tests to the calling edge" },
      scenario: "calling-registration",
      learningId: "wa-cloud-control"
    },
    "webex-meetings": {
      domains: ["collaboration", "network"],
      admin: CONTROL_HUB,
      scenario: "room-qoe",
      learningId: "wa-cloud-control"
    },
    "webex-cc": {
      domains: ["collaboration"],
      admin: CONTROL_HUB,
      scenario: "calling-registration"
    },
    "thousandeyes": {
      domains: ["network", "observability"],
      observability: { product: "ThousandEyes", hint: "Path visualization + BGP + app tests feed AI Canvas evidence" },
      scenario: "wan-brownout"
    },
    "catalyst-center": {
      domains: ["network"],
      observability: { product: "ThousandEyes", hint: "Assurance + interface telemetry" },
      scenario: "wan-brownout"
    },
    "meraki-mx": {
      domains: ["network"],
      scenario: "wan-brownout"
    },
    "meraki-switches": {
      domains: ["network"],
      scenario: "wan-brownout"
    },
    "meraki-wireless": {
      domains: ["network"],
      scenario: "room-qoe"
    },
    "sdwan": {
      domains: ["network"],
      observability: { product: "ThousandEyes", hint: "Per-path loss/latency drives SD-WAN steering" },
      scenario: "wan-brownout"
    },
    "nexus": {
      domains: ["compute", "network"],
      observability: { product: "Nexus Dashboard", hint: "Fabric telemetry + AgenticOps insights" },
      scenario: "dc-ai-fabric"
    },
    "intersight": {
      domains: ["compute"],
      scenario: "dc-ai-fabric"
    },
    "xdr": {
      domains: ["security", "network"],
      scenario: "security-anomaly"
    },
    "splunk": {
      domains: ["security", "observability"],
      scenario: "security-anomaly"
    },
    "fso": {
      domains: ["observability"],
      observability: { product: "FSO", hint: "OTel entity graph across app/infra/network" },
      scenario: "observability-gap"
    },
    "appdynamics": {
      domains: ["observability"],
      scenario: "observability-gap"
    }
  };

  const DOMAIN_LABELS = {
    collaboration: "Collaboration",
    network: "Network",
    security: "Security",
    compute: "Compute",
    observability: "Observability"
  };

  function getScenario(id) {
    return id && SCENARIOS[id] ? Object.assign({ id }, SCENARIOS[id]) : null;
  }

  function getOpsProfile(familyId) {
    const base = familyId && FAMILY_OPS[familyId];
    if (!base) return null;
    return Object.assign({ familyId }, base, { scenarioData: getScenario(base.scenario) });
  }

  function hasOps(familyId) {
    return !!(familyId && FAMILY_OPS[familyId]);
  }

  // Which scenarios are relevant given a set of family ids in the account stack.
  function scenariosForFamilies(familyIds) {
    const ids = [];
    (familyIds || []).forEach(fid => {
      const p = FAMILY_OPS[fid];
      if (p && p.scenario && ids.indexOf(p.scenario) < 0) ids.push(p.scenario);
    });
    if (!ids.length) ids.push("room-qoe");
    return ids.map(getScenario).filter(Boolean);
  }

  window.__cpnOps = {
    SCENARIOS,
    FAMILY_OPS,
    DOMAIN_LABELS,
    DOMAIN_AGENTS,
    getScenario,
    getOpsProfile,
    hasOps,
    scenariosForFamilies
  };
})();
