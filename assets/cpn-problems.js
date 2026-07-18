/**
 * Problems → Outcomes → Products layer (curated portfolio knowledge).
 *
 * This is the "why it matters" axis for the Portfolio Navigator. The tool already
 * models WHAT (families/products) and HOW (LINKS/bundles). This module adds the
 * business problem each family solves, the outcome, a directional proof point,
 * and persona-specific framing — then ties it back to the taxonomy the app
 * already maintains (useCases, BUNDLES names, dCloud path ids, One Cisco pillars).
 *
 * IMPORTANT: proof points are curated, directional talking points sourced from
 * Cisco solution positioning — NOT guarantees or live customer metrics. Treat
 * them as "commonly reported" outcomes for conversation, not contractual claims.
 *
 * Keys are intentionally reused so there is ONE source of truth:
 *   - families[]  → NODES ids (same ids products point at via .family)
 *   - bundles[]   → BUNDLES[].name strings
 *   - useCases[]  → NODES[].useCases / REF_ARCH keys
 *   - dcloudPath  → dcloud-links.json paths[].id
 *   - pillar      → ONE_CISCO.pillars[].id (+ "connectivity")
 *   - maturityNext→ another PROBLEMS id (expansion roadmap)
 */
(function () {
  "use strict";

  const PERSONAS = [
    { id: "netops", label: "NetOps", full: "Network / IT Operations" },
    { id: "cio", label: "CIO", full: "CIO / Business leader" },
    { id: "ciso", label: "CISO", full: "Security leader" }
  ];

  const DISCLAIMER =
    "Curated, directional talking points from Cisco solution positioning — not guarantees or live metrics.";

  const PROBLEMS = [
    /* ── Connectivity / Networking ─────────────────────────────────── */
    {
      id: "branch-app-experience",
      pillar: "connectivity",
      symptom: "Branch and remote users blame the network when SaaS, voice, and Webex feel slow.",
      outcome: "Consistent application experience from every site and home office.",
      proof: {
        metric: "Mean time to resolve app-vs-network issues",
        before: "Hours of finger-pointing with no shared evidence",
        after: "Minutes to pinpoint the failing hop",
        source: "Cisco SD-WAN + ThousandEyes positioning"
      },
      personas: {
        netops: "Steer traffic around brownouts automatically and prove where loss occurs with per-hop evidence.",
        cio: "Protect workforce productivity across every branch without adding circuits.",
        ciso: "Reach cloud apps securely without backhauling traffic to the data center."
      },
      useCases: ["SD-WAN / SASE", "Hybrid Work", "Cloud Migration"],
      bundles: ["Cloud Branch (SASE)"],
      families: ["sdwan", "meraki-mx", "isr-routers", "secure-routers", "thousandeyes", "secure-access"],
      refArch: "SD-WAN / SASE",
      signals: { has: ["sdwan"], missing: ["thousandeyes"] },
      dcloudPath: "sdwan-sase",
      maturityNext: "observability-blindspots"
    },
    {
      id: "campus-manual-ops",
      pillar: "connectivity",
      symptom: "The network team spends its week on manual CLI changes, tickets, and firefighting.",
      outcome: "Automated, intent-based operations with AI assurance across campus and WAN.",
      proof: {
        metric: "Time spent on manual provisioning & troubleshooting",
        before: "Change windows measured in days; config drift everywhere",
        after: "Templated, closed-loop automation with proactive assurance",
        source: "Cisco Catalyst Center automation positioning"
      },
      personas: {
        netops: "Push standardized changes fleet-wide and let assurance flag issues before users call.",
        cio: "Free scarce network talent from repetitive toil to focus on the business.",
        ciso: "Consistent policy everywhere means fewer misconfigurations to exploit."
      },
      useCases: ["Network Automation", "AI Networking"],
      bundles: [],
      families: ["catalyst-center", "catalyst-access", "catalyst-core", "meraki-switches", "intersight"],
      refArch: "Network Automation",
      signals: { has: ["catalyst-access"], missing: ["catalyst-center"] },
      dcloudPath: "network-automation",
      maturityNext: "observability-blindspots"
    },
    {
      id: "wifi-complaints",
      pillar: "workplaces",
      symptom: "\"The Wi-Fi is bad\" is a constant complaint, but no one can prove or fix the root cause.",
      outcome: "Reliable, self-optimizing wireless with client-level visibility.",
      proof: {
        metric: "Wireless issue triage time",
        before: "Guesswork and walk-arounds with a laptop",
        after: "Per-client health scores and AI-driven RF optimization",
        source: "Cisco / Meraki wireless assurance positioning"
      },
      personas: {
        netops: "See every client's experience and let AI tune RF instead of manual surveys.",
        cio: "Dependable connectivity for hybrid work, guests, and IoT in every space.",
        ciso: "Identify and segment rogue and unmanaged devices on the air."
      },
      useCases: ["Hybrid Work", "Network Automation", "AI Networking"],
      bundles: [],
      families: ["catalyst-wireless", "meraki-wireless", "catalyst-center"],
      refArch: "AI Networking",
      signals: { has: ["catalyst-wireless"], missing: ["catalyst-center"] },
      dcloudPath: "network-automation",
      maturityNext: "campus-manual-ops"
    },

    /* ── Security / Resilience ─────────────────────────────────────── */
    {
      id: "flat-network-breach",
      pillar: "resilience",
      symptom: "One infected laptop can reach everything — a flat network turns an incident into an outage.",
      outcome: "Zero-trust segmentation that contains threats to a single segment.",
      proof: {
        metric: "Blast radius of a compromised device",
        before: "Lateral movement across the whole network",
        after: "Contained to one segment via identity-based policy",
        source: "Cisco Zero Trust (ISE + Secure Firewall + Duo) positioning"
      },
      personas: {
        netops: "Enforce who-talks-to-whom without redesigning the network by hand.",
        cio: "Reduce the business impact of the breach that will eventually happen.",
        ciso: "Identity-based micro-segmentation that stops lateral movement cold."
      },
      useCases: ["Zero Trust Security", "Network Automation"],
      bundles: ["Zero Trust Foundation"],
      families: ["ise", "sf-branch", "sf-enterprise", "duo", "secure-access", "secure-workload", "hypershield"],
      refArch: "Zero Trust Security",
      signals: { has: ["ise"], missing: ["duo"] },
      dcloudPath: "zero-trust",
      maturityNext: "threat-dwell-time"
    },
    {
      id: "vpn-overload",
      pillar: "connectivity",
      symptom: "Legacy VPN is slow, over-trusted, and doesn't scale to a hybrid workforce.",
      outcome: "Zero-trust access to any app, on-prem or cloud, without a full-tunnel VPN.",
      proof: {
        metric: "Remote access risk & user friction",
        before: "Broad network access once the VPN is up",
        after: "Per-app, identity- and posture-based access (ZTNA)",
        source: "Cisco Secure Access (SSE) positioning"
      },
      personas: {
        netops: "Retire VPN concentrators for a cloud-delivered access edge.",
        cio: "Faster, simpler access for employees and third parties from anywhere.",
        ciso: "Least-privilege access replaces implicit trust in the VPN tunnel."
      },
      useCases: ["Zero Trust Security", "SD-WAN / SASE", "Hybrid Work"],
      bundles: ["Cloud Branch (SASE)", "Zero Trust Foundation"],
      families: ["secure-access", "duo", "umbrella", "secure-client"],
      refArch: "Zero Trust Security",
      signals: { has: ["secure-client"], missing: ["secure-access"] },
      dcloudPath: "zero-trust",
      maturityNext: "flat-network-breach"
    },
    {
      id: "threat-dwell-time",
      pillar: "resilience",
      symptom: "Attacks hide for weeks and the SOC drowns in disconnected alerts.",
      outcome: "Correlated detection and automated response across endpoint, network, and SIEM.",
      proof: {
        metric: "Threat dwell time & analyst effort",
        before: "Siloed tools; manual correlation across consoles",
        after: "One correlated incident with guided/automated response",
        source: "Cisco XDR + Splunk + Talos positioning"
      },
      personas: {
        netops: "Fewer console swivel-chairs; network context feeds the investigation automatically.",
        cio: "Detect and contain incidents before they become headlines.",
        ciso: "Cross-domain correlation and Talos intel cut dwell time and analyst fatigue."
      },
      useCases: ["Zero Trust Security"],
      bundles: ["Threat Defense Platform"],
      families: ["xdr", "secure-endpoint", "splunk", "talos", "stealthwatch"],
      signals: { has: ["secure-endpoint"], missing: ["xdr"] },
      dcloudPath: "zero-trust",
      maturityNext: "unknown-assets"
    },
    {
      id: "phishing-email",
      pillar: "resilience",
      symptom: "Email is still the #1 way attackers get in — phishing and BEC slip past filters.",
      outcome: "Layered email defense that blocks phishing, malware, and account takeover.",
      proof: {
        metric: "Malicious email reaching inboxes",
        before: "Native filtering misses targeted phishing/BEC",
        after: "Threat intelligence-driven blocking with rapid remediation",
        source: "Cisco Secure Email Threat Defense positioning"
      },
      personas: {
        netops: "Less malware to chase on endpoints and the network.",
        cio: "Protect the workforce from the most common breach entry point.",
        ciso: "Talos-backed detection of phishing, BEC, and malicious payloads."
      },
      useCases: ["Zero Trust Security"],
      bundles: ["Threat Defense Platform"],
      families: ["secure-email", "secure-endpoint", "secure-web", "talos"],
      signals: { has: ["secure-endpoint"], missing: ["secure-email"] },
      maturityNext: "threat-dwell-time"
    },
    {
      id: "identity-attacks",
      pillar: "resilience",
      symptom: "Stolen credentials and MFA fatigue are a top attack path into apps and infrastructure.",
      outcome: "Strong, phishing-resistant identity with continuous trust checks.",
      proof: {
        metric: "Credential-based intrusion risk",
        before: "Passwords + basic MFA that users click through",
        after: "Device trust, risk-based and phishing-resistant MFA",
        source: "Cisco Duo + Identity Intelligence positioning"
      },
      personas: {
        netops: "One access policy engine across VPN, apps, and network.",
        cio: "Reduce account-takeover risk without slowing employees down.",
        ciso: "Continuous, risk-based identity assurance and anomaly detection."
      },
      useCases: ["Zero Trust Security", "Hybrid Work"],
      bundles: ["Zero Trust Foundation"],
      families: ["duo", "ise", "identity-intel", "secure-access"],
      refArch: "Zero Trust Security",
      signals: { has: ["duo"], missing: ["identity-intel"] },
      dcloudPath: "zero-trust",
      maturityNext: "flat-network-breach"
    },
    {
      id: "ai-app-security",
      pillar: "resilience",
      symptom: "New AI apps and models introduce risks that traditional security tools don't see.",
      outcome: "Guardrails and runtime protection purpose-built for AI workloads.",
      proof: {
        metric: "AI/workload attack surface",
        before: "AI apps deployed with no model- or prompt-level controls",
        after: "Validated models, protected runtime, and segmented workloads",
        source: "Cisco AI Defense + Hypershield positioning"
      },
      personas: {
        netops: "Autonomous, kernel-level segmentation that keeps up with workload sprawl.",
        cio: "Adopt AI confidently without opening a new class of risk.",
        ciso: "Discover, validate, and protect AI apps and models end to end."
      },
      useCases: ["Zero Trust Security", "Data Center Modernization", "AI Networking"],
      bundles: [],
      families: ["ai-defense", "hypershield", "secure-workload", "multicloud-defense"],
      signals: { has: ["secure-workload"], missing: ["ai-defense"] },
      maturityNext: "ai-infra-ready"
    },

    /* ── Collaboration / Workplaces ────────────────────────────────── */
    {
      id: "hybrid-meeting-equity",
      pillar: "workplaces",
      symptom: "Remote attendees can't participate equally and expensive rooms sit underused.",
      outcome: "Equitable hybrid meetings with AI-powered rooms people actually book.",
      proof: {
        metric: "Meeting equity & room utilization",
        before: "In-room voices dominate; remote people are second-class",
        after: "AI framing, noise removal, and per-person audio for everyone",
        source: "Cisco Rooms + Webex positioning"
      },
      personas: {
        netops: "Zero-touch devices managed centrally in Control Hub.",
        cio: "Get the return on real estate and make hybrid work feel fair.",
        ciso: "Managed, updatable endpoints instead of unmanaged BYO gear."
      },
      useCases: ["Hybrid Work"],
      bundles: ["Hybrid Work Suite"],
      families: ["room-systems", "desk-devices", "webex-meetings", "webex-app", "cisco-headsets", "conf-phones"],
      refArch: "Hybrid Work",
      signals: { has: ["webex-app"], missing: ["room-systems"] },
      dcloudPath: "hybrid-work",
      maturityNext: "room-quality"
    },
    {
      id: "pbx-eol",
      pillar: "workplaces",
      symptom: "The aging PBX is end-of-life and on-prem telephony is costly to maintain.",
      outcome: "Cloud calling that unifies voice with meetings and messaging.",
      proof: {
        metric: "Telephony TCO & agility",
        before: "Hardware PBX, PSTN contracts, per-site maintenance",
        after: "Cloud calling with global reach in one app and admin plane",
        source: "Cisco Webex Calling positioning"
      },
      personas: {
        netops: "Retire PBX hardware; manage calling from the cloud.",
        cio: "Modern calling experience with predictable subscription cost.",
        ciso: "Centralized, encrypted calling with unified admin controls."
      },
      useCases: ["Hybrid Work"],
      bundles: ["Hybrid Work Suite"],
      families: ["webex-calling", "webex-app", "ip-phones", "conf-phones"],
      refArch: "Hybrid Work",
      signals: { has: ["ip-phones"], missing: ["webex-calling"] },
      dcloudPath: "hybrid-work",
      maturityNext: "contact-center-cx"
    },
    {
      id: "contact-center-cx",
      pillar: "workplaces",
      symptom: "Customers wait on hold, repeat themselves, and can't reach you on digital channels.",
      outcome: "AI-powered, omnichannel customer experience with self-service.",
      proof: {
        metric: "Customer effort & handle time",
        before: "Voice-only queues; agents lack context",
        after: "AI routing, digital channels, and self-service deflection",
        source: "Cisco Webex Contact Center positioning"
      },
      personas: {
        netops: "Cloud-delivered CC with no on-prem stack to babysit.",
        cio: "Differentiate on customer experience and lower cost-to-serve.",
        ciso: "Secure agent access and compliant, encrypted interactions."
      },
      useCases: ["Hybrid Work"],
      bundles: ["Cloud Contact Center"],
      families: ["webex-cc", "webex-connect", "webex-calling", "webex-app"],
      signals: { has: ["webex-calling"], missing: ["webex-cc"] },
      dcloudPath: "contact-center",
      maturityNext: "pbx-eol"
    },
    {
      id: "room-quality",
      pillar: "workplaces",
      symptom: "Executives complain that video is choppy and no one can explain why fast enough.",
      outcome: "Proactive meeting quality with cross-domain root cause in minutes.",
      proof: {
        metric: "Time to root-cause a bad meeting",
        before: "Blame bounces between collab, network, and ISP",
        after: "Correlated device + path evidence in one investigation",
        source: "Cisco Cloud Control / AI Canvas positioning"
      },
      personas: {
        netops: "See device health and WAN path health side by side.",
        cio: "Reliable executive and all-hands experiences, every time.",
        ciso: "Managed devices and visibility instead of shadow AV."
      },
      useCases: ["Hybrid Work", "SD-WAN / SASE"],
      bundles: ["Hybrid Work Suite", "Cloud Control Platform"],
      families: ["room-systems", "thousandeyes", "cloud-control", "webex-meetings"],
      signals: { has: ["room-systems"], missing: ["thousandeyes"] },
      dcloudPath: "hybrid-work",
      maturityNext: "observability-blindspots"
    },

    /* ── Data Center / AI ──────────────────────────────────────────── */
    {
      id: "ai-infra-ready",
      pillar: "ai-dc",
      symptom: "The business wants AI/GPU workloads but the data center isn't built for them.",
      outcome: "An AI-ready fabric and compute foundation that scales GPU workloads.",
      proof: {
        metric: "Time-to-stand-up AI infrastructure",
        before: "Hand-built, congested fabrics that starve GPUs",
        after: "Validated AI-ready fabric + compute with lossless transport",
        source: "Cisco AI-Ready Data Center (Nexus + UCS + Silicon One) positioning"
      },
      personas: {
        netops: "Non-blocking, low-latency fabric designed for RDMA/AI traffic.",
        cio: "Stand up AI initiatives on infrastructure that won't be the bottleneck.",
        ciso: "Segment and protect high-value AI data and workloads by design."
      },
      useCases: ["AI Networking", "Data Center Modernization", "Data Center Networking"],
      bundles: ["AI-Ready Data Center Network"],
      families: ["nexus", "nexus-one", "silicon-one", "ucs", "intersight"],
      refArch: "AI Networking",
      signals: { has: ["ucs"], missing: ["nexus"] },
      dcloudPath: "ai-networking",
      maturityNext: "ai-fabric-bottleneck"
    },
    {
      id: "dc-sprawl",
      pillar: "ai-dc",
      symptom: "The data center is a sprawl of legacy silos that are slow and costly to operate.",
      outcome: "A modern, policy-driven data center operated from the cloud.",
      proof: {
        metric: "Data center operational complexity",
        before: "Device-by-device management across disconnected silos",
        after: "Policy-based fabric + HCI with cloud operations",
        source: "Cisco Data Center Modernization positioning"
      },
      personas: {
        netops: "Automate fabric and compute from a single operations plane.",
        cio: "Lower data center TCO and move faster on new services.",
        ciso: "Consistent policy and workload protection across the estate."
      },
      useCases: ["Data Center Modernization", "Data Center Networking", "Network Automation"],
      bundles: ["Data Center Modernization"],
      families: ["nexus", "aci", "ucs", "hyperflex", "intersight", "multicloud-defense"],
      refArch: "Data Center Modernization",
      signals: { has: ["ucs"], missing: ["intersight"] },
      dcloudPath: "dc-modernization",
      maturityNext: "ai-infra-ready"
    },
    {
      id: "ai-fabric-bottleneck",
      pillar: "ai-dc",
      symptom: "GPU training jobs stall and no one can tell if the fabric is the bottleneck.",
      outcome: "Fabric telemetry that protects AI workloads and pinpoints congestion.",
      proof: {
        metric: "AI job throughput lost to congestion",
        before: "Blind to ECN/buffer pressure on the fabric",
        after: "Per-leaf telemetry and QoS that protects the AI class",
        source: "Cisco Nexus Dashboard / AI fabric positioning"
      },
      personas: {
        netops: "See buffer/ECN pressure per switch and rebalance flows.",
        cio: "Protect expensive GPU cycles from network waste.",
        ciso: "Keep AI data on protected, observable paths."
      },
      useCases: ["AI Networking", "Data Center Networking"],
      bundles: ["AI-Ready Data Center Network"],
      families: ["nexus", "nexus-one", "intersight", "silicon-one"],
      signals: { has: ["nexus"], missing: ["thousandeyes"] },
      dcloudPath: "ai-networking",
      maturityNext: "observability-blindspots"
    },

    /* ── Industrial / IoT ──────────────────────────────────────────── */
    {
      id: "ot-blind",
      pillar: "resilience",
      symptom: "You can't see or secure the OT devices running the plant floor.",
      outcome: "Full OT visibility and zero-trust segmentation across IT/OT.",
      proof: {
        metric: "OT asset visibility & exposure",
        before: "Unknown industrial assets on flat OT networks",
        after: "Complete asset inventory with segmented, monitored OT",
        source: "Cisco Cyber Vision + Industrial Ethernet + ISE positioning"
      },
      personas: {
        netops: "Ruggedized networking with built-in OT discovery.",
        cio: "Keep production running while connecting the plant safely.",
        ciso: "See every OT asset and contain threats before they hit operations."
      },
      useCases: ["IoT / Industrial", "Zero Trust Security"],
      bundles: ["Industrial OT Security"],
      families: ["cyber-vision", "industrial-eth", "ise", "sf-branch", "secure-equipment"],
      refArch: "IoT / Industrial",
      signals: { has: ["industrial-eth"], missing: ["cyber-vision"] },
      dcloudPath: "iot-industrial",
      maturityNext: "flat-network-breach"
    },

    /* ── Operations / Observability (cross-cutting) ────────────────── */
    {
      id: "observability-blindspots",
      pillar: "resilience",
      symptom: "When something breaks, teams argue in a war room because no one owns the full picture.",
      outcome: "Cross-domain observability that ends finger-pointing and shortens MTTR.",
      proof: {
        metric: "Mean time to resolution (cross-team)",
        before: "War rooms; each team sees only its own slice",
        after: "One correlated view across app, network, and internet",
        source: "Cisco ThousandEyes + Splunk + AgenticOps positioning"
      },
      personas: {
        netops: "Prove it's not the network — or fix it fast when it is.",
        cio: "Less downtime and fewer costly war rooms.",
        ciso: "Telemetry everywhere means investigations aren't blind."
      },
      useCases: ["AI Networking", "SD-WAN / SASE", "Data Center Modernization"],
      bundles: ["Cloud Control Platform"],
      families: ["thousandeyes", "splunk", "fso", "appdynamics", "cloud-control"],
      signals: { has: ["thousandeyes"], missing: ["cloud-control"] },
      dcloudPath: "ai-networking",
      maturityNext: "tool-sprawl-ops"
    },
    {
      id: "tool-sprawl-ops",
      pillar: "resilience",
      symptom: "Operators juggle a dozen dashboards and still can't answer a simple question fast.",
      outcome: "A unified, AI-native operations plane across domains (AgenticOps).",
      proof: {
        metric: "Consoles per investigation",
        before: "Swivel-chair across many disconnected tools",
        after: "One AI-assisted canvas correlating every domain",
        source: "Cisco Cloud Control / AI Canvas positioning"
      },
      personas: {
        netops: "Ask a question once and let agents assemble the evidence.",
        cio: "Operational efficiency and faster answers for the business.",
        ciso: "Security context joins the same investigation surface."
      },
      useCases: ["Network Automation", "AI Networking"],
      bundles: ["Cloud Control Platform", "Cisco IQ Operations"],
      families: ["cloud-control", "cisco-iq", "intersight", "catalyst-center"],
      signals: { has: ["catalyst-center"], missing: ["cloud-control"] },
      dcloudPath: "ai-networking",
      maturityNext: "unknown-assets"
    },
    {
      id: "unknown-assets",
      pillar: "resilience",
      symptom: "You don't have a reliable inventory of your Cisco estate or its risk exposure.",
      outcome: "A unified asset landscape with AI troubleshooting and risk prioritization.",
      proof: {
        metric: "Time to answer \"what do we have and what's at risk?\"",
        before: "Spreadsheets and stale CMDB data",
        after: "Live asset landscape with prioritized vulnerabilities",
        source: "Cisco IQ + Vulnerability Management positioning"
      },
      personas: {
        netops: "Know exactly what's deployed and what needs attention.",
        cio: "Governance and lifecycle clarity across the Cisco investment.",
        ciso: "Prioritize the vulnerabilities that actually matter to your estate."
      },
      useCases: ["Network Automation"],
      bundles: ["Cisco IQ Operations"],
      families: ["cisco-iq", "vuln-mgmt", "xdr", "intersight"],
      refArch: "Operational Resilience",
      signals: { has: ["catalyst-center"], missing: ["cisco-iq"] },
      maturityNext: "observability-blindspots"
    },
    {
      id: "app-performance",
      pillar: "resilience",
      symptom: "A critical app is slow and dev and ops blame each other with no shared truth.",
      outcome: "Full-stack observability that ties app performance to infrastructure.",
      proof: {
        metric: "Time to isolate app performance issues",
        before: "Dev vs ops standoff with separate tools",
        after: "Correlated app, infra, and network telemetry",
        source: "Cisco AppDynamics / FSO + Splunk positioning"
      },
      personas: {
        netops: "See whether the app or the infrastructure is at fault.",
        cio: "Protect revenue-driving digital experiences.",
        ciso: "Spot anomalies that signal abuse or compromise in the app tier."
      },
      useCases: ["Data Center Modernization", "Cloud Migration"],
      bundles: ["Cloud Control Platform"],
      families: ["appdynamics", "fso", "splunk", "thousandeyes"],
      signals: { has: ["splunk"], missing: ["appdynamics"] },
      maturityNext: "observability-blindspots"
    }
  ];

  // Fast lookups
  const BY_ID = {};
  const BY_FAMILY = {};
  PROBLEMS.forEach(p => {
    BY_ID[p.id] = p;
    (p.families || []).forEach(f => {
      (BY_FAMILY[f] = BY_FAMILY[f] || []).push(p);
    });
  });

  // Symptom-first discovery: plain-language pains → problem id.
  const SYMPTOMS = PROBLEMS.map(p => ({ id: p.id, text: p.symptom, problem: p.id }));

  /* ── Resolvers ─────────────────────────────────────────────────── */
  function getProblem(id) {
    return id && BY_ID[id] ? BY_ID[id] : null;
  }
  function problemsForFamily(familyId) {
    return (familyId && BY_FAMILY[familyId]) ? BY_FAMILY[familyId].slice() : [];
  }
  function problemsForProduct(productId, familyId) {
    return problemsForFamily(familyId);
  }
  function topProblemForFamily(familyId) {
    const list = problemsForFamily(familyId);
    return list.length ? list[0] : null;
  }
  function hasProblems(familyId) {
    return !!(familyId && BY_FAMILY[familyId] && BY_FAMILY[familyId].length);
  }
  function problemsForStack(familyIds) {
    const seen = new Set();
    const out = [];
    (familyIds || []).forEach(fid => {
      problemsForFamily(fid).forEach(p => {
        if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
      });
    });
    // preserve catalog order for stable display
    return PROBLEMS.filter(p => seen.has(p.id));
  }
  function problemsForBundle(name) {
    return PROBLEMS.filter(p => (p.bundles || []).indexOf(name) >= 0);
  }
  function topProblemForBundle(name) {
    const list = problemsForBundle(name);
    return list.length ? list[0] : null;
  }
  function problemsForUseCase(uc) {
    return PROBLEMS.filter(p => (p.useCases || []).indexOf(uc) >= 0);
  }

  // For a set of family ids, which curated outcomes are addressed vs. adjacent-open.
  // "open" is filtered to problems that share a useCase with the stack so we only
  // surface relevant gaps, not the entire catalog.
  function outcomeCoverage(familyIds) {
    const fam = new Set(familyIds || []);
    const stackUC = new Set();
    fam.forEach(f => {
      problemsForFamily(f).forEach(p => (p.useCases || []).forEach(u => stackUC.add(u)));
    });
    const addressed = [];
    const open = [];
    PROBLEMS.forEach(p => {
      const by = (p.families || []).filter(f => fam.has(f));
      if (by.length) {
        addressed.push({ problem: p, by });
      } else if ((p.useCases || []).some(u => stackUC.has(u))) {
        open.push({ problem: p, gapFamilies: (p.families || []).slice(0, 3) });
      }
    });
    return { addressed, open };
  }

  function personaLine(problem, persona) {
    if (!problem) return "";
    const key = persona && problem.personas && problem.personas[persona] ? persona : null;
    return key ? problem.personas[key] : problem.outcome;
  }

  // Customer-ready narrative for the AI assistant / exports.
  function problemNarrative(familyIds, persona) {
    const cov = outcomeCoverage(familyIds);
    const lines = [];
    if (cov.addressed.length) {
      const tops = cov.addressed.slice(0, 4)
        .map(a => `• ${a.problem.outcome} (${a.by.map(nameOr).join(", ")})`);
      lines.push("Problems this stack already addresses:");
      lines.push(...tops);
    }
    if (cov.open.length) {
      const gap = cov.open[0];
      lines.push(
        `Biggest unaddressed outcome: ${gap.problem.outcome} — consider ${gap.gapFamilies.map(nameOr).join(", ")}.`
      );
    }
    if (persona && cov.addressed.length) {
      const pl = personaLine(cov.addressed[0].problem, persona);
      if (pl) lines.push(`For a ${personaLabel(persona)}: ${pl}`);
    }
    return lines.join("\n");
  }

  function personaLabel(id) {
    const p = PERSONAS.find(x => x.id === id);
    return p ? p.label : id;
  }

  // Resolve a family id to a human name if the host app exposes nodeById; else the id.
  function nameOr(familyId) {
    try {
      if (window.nodeById && window.nodeById[familyId] && window.nodeById[familyId].name) {
        return window.nodeById[familyId].name;
      }
    } catch (e) { /* noop */ }
    return familyId;
  }

  window.__cpnProblems = {
    PROBLEMS,
    PERSONAS,
    SYMPTOMS,
    DISCLAIMER,
    getProblem,
    problemsForFamily,
    problemsForProduct,
    topProblemForFamily,
    hasProblems,
    problemsForStack,
    problemsForBundle,
    topProblemForBundle,
    problemsForUseCase,
    outcomeCoverage,
    personaLine,
    personaLabel,
    problemNarrative,
    nameOr
  };
})();
