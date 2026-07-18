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
        netops: {
          line: "Steer traffic around brownouts automatically and prove where loss occurs with per-hop evidence.",
          symptom: "Every SaaS slowdown becomes a network ticket you have to disprove by hand.",
          proof: { metric: "MTTR for app-vs-network issues", before: "Hours of finger-pointing with no shared evidence", after: "Minutes to pinpoint the failing hop with per-hop telemetry" }
        },
        cio: {
          line: "Improve application experience across branches by using available paths more intelligently before adding bandwidth.",
          symptom: "Slow apps at branches quietly drain workforce productivity everywhere.",
          proof: { metric: "Branch application experience", before: "Users lose time to unpredictable application performance", after: "Application-aware path selection makes better use of available connectivity" }
        },
        ciso: {
          line: "Inspect branch-to-cloud access through cloud-delivered SSE without forcing routine traffic through a central data center.",
          symptom: "Backhauling branch traffic for inspection adds latency and risk.",
          proof: { metric: "Secure branch-to-cloud access", before: "Traffic is hair-pinned to a central data center for inspection", after: "SD-WAN steers traffic to cloud-delivered security enforcement" }
        }
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
      outcome: "Standardized, intent-based operations and assurance across campus and branch wired and wireless networks.",
      proof: {
        metric: "Time spent on manual provisioning & troubleshooting",
        before: "Change windows measured in days; config drift everywhere",
        after: "Template-based provisioning with assurance-guided troubleshooting",
        source: "Cisco Catalyst Center automation positioning"
      },
      personas: {
        netops: {
          line: "Standardize changes across sites and use assurance to find issues before tickets multiply.",
          symptom: "You're the bottleneck — every change is a manual, after-hours CLI push.",
          proof: { metric: "Provisioning & troubleshooting effort", before: "Device-by-device changes and inconsistent configurations", after: "Reusable profiles with assurance-guided troubleshooting" }
        },
        cio: {
          line: "Shift scarce network talent from repetitive changes toward service improvement.",
          symptom: "Routine provisioning and troubleshooting consume engineers needed for modernization.",
          proof: { metric: "Use of network engineering capacity", before: "Specialists spend time on repetitive changes and triage", after: "Standard workflows reduce routine operational effort" }
        },
        ciso: {
          line: "Use standardized configurations and policy to reduce avoidable security drift.",
          symptom: "Manual, inconsistent configs are a steady source of exploitable gaps.",
          proof: { metric: "Configuration-driven exposure", before: "Drift and one-off changes create review gaps", after: "Standard profiles make deviations easier to identify" }
        }
      },
      useCases: ["Network Automation", "AI Networking"],
      bundles: [],
      families: ["catalyst-center", "catalyst-access", "catalyst-core", "meraki-switches", "catalyst-wireless"],
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
        netops: {
          line: "See every client's experience and let AI tune RF instead of manual surveys.",
          symptom: "Wi-Fi complaints send you walking the floor with a laptop, guessing at RF.",
          proof: { metric: "Wireless triage time", before: "Guesswork and manual site surveys", after: "Per-client health scores and AI-driven RF optimization" }
        },
        cio: {
          line: "Dependable connectivity for hybrid work, guests, and IoT in every space.",
          symptom: "Flaky Wi-Fi undermines hybrid work, guests, and every connected space.",
          proof: { metric: "Workplace connectivity reliability", before: "Unpredictable coverage and constant complaints", after: "Dependable, self-optimizing wireless everywhere" }
        },
        ciso: {
          line: "Improve visibility into wireless clients and rogue access points so access-control decisions start with better evidence.",
          symptom: "Unmanaged and rogue devices on the air are an invisible attack surface.",
          proof: { metric: "Wireless device visibility", before: "Unknown clients and rogue access points require manual investigation", after: "Client and rogue-device telemetry supports investigation and access policy" }
        }
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
      outcome: "Identity-based segmentation that limits lateral movement and reduces breach impact.",
      proof: {
        metric: "Blast radius of a compromised device",
        before: "Lateral movement across the whole network",
        after: "Access constrained by identity and group-based policy",
        source: "Cisco SD-Access segmentation with ISE and Secure Firewall positioning"
      },
      personas: {
        netops: {
          line: "Apply group-based access policy in phases without a wholesale network replacement.",
          symptom: "Segmenting the network by hand means VLAN spaghetti no one wants to touch.",
          proof: { metric: "Effort to enforce segmentation", before: "Growing VLAN and ACL complexity", after: "Group-based policy with centralized identity context" }
        },
        cio: {
          line: "Reduce the potential business impact when a device or identity is compromised.",
          symptom: "One infected device can escalate into a business-wide outage.",
          proof: { metric: "Potential breach impact", before: "Broad reachability increases lateral-movement paths", after: "Policy limits which users and devices can reach sensitive resources" }
        },
        ciso: {
          line: "Use identity and group-based policy to constrain lateral movement.",
          symptom: "Flat networks let attackers move laterally at will after the first foothold.",
          proof: { metric: "Reachability from a compromised device", before: "Broad access enables more lateral-movement paths", after: "Access constrained by identity and group-based policy" }
        }
      },
      useCases: ["Zero Trust Security", "Network Automation"],
      bundles: ["Zero Trust Foundation"],
      families: ["ise", "catalyst-access", "catalyst-center", "sf-branch", "sf-enterprise"],
      refArch: "Zero Trust Security",
      signals: { has: ["ise"], missing: ["duo"] },
      dcloudPath: "zero-trust",
      maturityNext: "threat-dwell-time"
    },
    {
      id: "vpn-overload",
      pillar: "connectivity",
      symptom: "Legacy VPN is slow, over-trusted, and doesn't scale to a hybrid workforce.",
      outcome: "Least-privilege access for private and internet applications using ZTNA, with VPNaaS where full network access is still required.",
      proof: {
        metric: "Remote access risk & user friction",
        before: "Broad network access once the VPN is up",
        after: "Per-app, identity- and posture-based access (ZTNA)",
        source: "Cisco Secure Access (SSE) positioning"
      },
      personas: {
        netops: {
          line: "Reduce on-premises VPN infrastructure by using cloud-delivered ZTNA and VPNaaS where each fits.",
          symptom: "You're scaling and babysitting VPN concentrators that users still hate.",
          proof: { metric: "Remote access operations", before: "On-premises headends to size, patch, and scale", after: "Cloud-delivered access with ZTNA plus VPNaaS for legacy needs" }
        },
        cio: {
          line: "Faster, simpler access for employees and third parties from anywhere.",
          symptom: "Clunky remote access slows down employees and partners every day.",
          proof: { metric: "Workforce access experience", before: "A full network tunnel for routine application access", after: "Context-aware access matched to the application" }
        },
        ciso: {
          line: "Least-privilege access replaces implicit trust in the VPN tunnel.",
          symptom: "Once the VPN is up, users get broad, implicit network trust.",
          proof: { metric: "Remote access trust model", before: "Broad network access once the tunnel is up", after: "Per-app, identity- and posture-based access (ZTNA)" }
        }
      },
      useCases: ["Zero Trust Security", "SD-WAN / SASE", "Hybrid Work"],
      bundles: ["Cloud Branch (SASE)", "Zero Trust Foundation"],
      families: ["secure-access", "duo", "secure-client"],
      refArch: "Zero Trust Security",
      signals: { has: ["secure-client"], missing: ["secure-access"] },
      dcloudPath: "zero-trust",
      maturityNext: "flat-network-breach"
    },
    {
      id: "threat-dwell-time",
      pillar: "resilience",
      symptom: "Attacks hide for weeks and the SOC drowns in disconnected alerts.",
      outcome: "Correlated detection, investigation, and response across endpoint, network analytics, XDR, and SIEM workflows.",
      proof: {
        metric: "Threat dwell time & analyst effort",
        before: "Siloed tools; manual correlation across consoles",
        after: "One correlated incident with guided/automated response",
        source: "Cisco XDR + Secure Network Analytics + Splunk positioning"
      },
      personas: {
        netops: {
          line: "Feed network detections and context into XDR investigations instead of assembling them manually.",
          symptom: "Security keeps pulling you into investigations across yet more consoles.",
          proof: { metric: "Network's role in investigations", before: "Manual pulls of network context per case", after: "Network telemetry auto-feeds the investigation" }
        },
        cio: {
          line: "Detect and contain incidents before they become headlines.",
          symptom: "Disconnected security tools increase the time and cost required to understand a serious incident.",
          proof: { metric: "Incident investigation and containment", before: "Teams reconstruct context across separate tools", after: "Correlated incidents support faster, more consistent triage" }
        },
        ciso: {
          line: "Correlate endpoint, network, identity, and threat intelligence to reduce analyst investigation effort.",
          symptom: "Analysts spend too much time correlating alerts and rebuilding context across tools.",
          proof: { metric: "Threat dwell time & analyst effort", before: "Siloed tools; manual correlation across consoles", after: "One correlated incident with guided/automated response" }
        }
      },
      useCases: ["Threat Detection & Response"],
      bundles: ["Threat Defense Platform"],
      families: ["xdr", "secure-endpoint", "splunk", "talos", "stealthwatch"],
      signals: { has: ["secure-endpoint"], missing: ["xdr"] },
      dcloudPath: "zero-trust",
      maturityNext: "unknown-assets"
    },
    {
      id: "phishing-email",
      pillar: "resilience",
      symptom: "Email remains a common entry path, and targeted phishing or business-email compromise can evade basic filtering.",
      outcome: "Layered email defense that blocks phishing, malware, and account takeover.",
      proof: {
        metric: "Malicious email reaching inboxes",
        before: "Native filtering misses targeted phishing/BEC",
        after: "Threat intelligence-driven blocking with rapid remediation",
        source: "Cisco Secure Email Threat Defense positioning"
      },
      personas: {
        netops: {
          line: "Give IT operations clearer containment actions when an email-originated incident reaches a user.",
          symptom: "Email-originated incidents arrive as urgent isolate-and-block requests with limited shared context.",
          proof: { metric: "Operational handoffs after an email threat", before: "Ad hoc requests across email, endpoint, and network teams", after: "Shared incident context and coordinated response actions" }
        },
        cio: {
          line: "Protect the workforce from the most common breach entry point.",
          symptom: "Phishing and BEC target your people and your finances directly.",
          proof: { metric: "Exposure to email-borne fraud", before: "Targeted phishing/BEC reaching staff", after: "Layered defense against fraud and account takeover" }
        },
        ciso: {
          line: "Talos-backed detection of phishing, BEC, and malicious payloads.",
          symptom: "Native email filtering misses targeted phishing and BEC.",
          proof: { metric: "Malicious email reaching inboxes", before: "Native filtering misses targeted phishing/BEC", after: "Threat intelligence-driven blocking with rapid remediation" }
        }
      },
      useCases: ["Threat Detection & Response"],
      bundles: ["Threat Defense Platform"],
      families: ["secure-email", "xdr", "secure-endpoint", "talos"],
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
        netops: {
          line: "Reuse identity and device-trust signals across network, remote-access, and application decisions.",
          symptom: "Network, VPN, and application access decisions rely on disconnected identity and device context.",
          proof: { metric: "Access-policy consistency", before: "Different identity and posture context by access path", after: "Shared identity and device-trust signals inform access decisions" }
        },
        cio: {
          line: "Reduce account-takeover risk without slowing employees down.",
          symptom: "Account-takeover risk grows, but employees won't tolerate more friction.",
          proof: { metric: "Account-takeover risk vs. friction", before: "Passwords + basic MFA users click through", after: "Strong identity that stays low-friction" }
        },
        ciso: {
          line: "Continuous, risk-based identity assurance and anomaly detection.",
          symptom: "Stolen credentials and MFA fatigue are the top path into your apps.",
          proof: { metric: "Credential-based intrusion risk", before: "Passwords + basic MFA that users click through", after: "Device trust, risk-based and phishing-resistant MFA" }
        }
      },
      useCases: ["Zero Trust Security", "Threat Detection & Response", "Hybrid Work"],
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
        netops: {
          line: "Give platform and network teams visibility into AI application traffic and enforce runtime guardrails consistently.",
          symptom: "AI applications and agents introduce new traffic patterns, data paths, and operational dependencies that are difficult to inventory.",
          proof: { metric: "Operational visibility for AI applications", before: "AI assets and traffic are discovered through ad hoc investigation", after: "AI assets, models, and application traffic are mapped for policy and operations" }
        },
        cio: {
          line: "Adopt AI confidently without opening a new class of risk.",
          symptom: "The business wants AI now, but no one owns the new risk it creates.",
          proof: { metric: "Governance for AI adoption", before: "AI applications launch without consistent validation or runtime policy", after: "Validation findings and runtime guardrails support governed adoption" }
        },
        ciso: {
          line: "Discover, validate, and protect AI apps and models end to end.",
          symptom: "AI apps and models are a blind spot for traditional security tools.",
          proof: { metric: "AI/workload attack surface", before: "AI apps deployed with no model- or prompt-level controls", after: "Validated models, protected runtime, and segmented workloads" }
        }
      },
      useCases: ["Threat Detection & Response", "Cloud Migration"],
      bundles: [],
      families: ["ai-defense"],
      signals: { has: [], missing: ["ai-defense"] },
      maturityNext: "workload-runtime-protection"
    },
    {
      id: "workload-runtime-protection",
      pillar: "resilience",
      symptom: "Application teams move workloads across data centers and clouds faster than security teams can understand dependencies and maintain segmentation policy.",
      outcome: "Workload-level visibility and adaptive segmentation that reduce lateral-movement paths across hybrid environments.",
      proof: {
        metric: "Workload segmentation operations",
        before: "Application dependencies and policies are maintained through manual discovery and static rules",
        after: "Observed workload behavior informs policy recommendations, testing, and distributed enforcement",
        source: "Cisco Hypershield autonomous segmentation and Secure Workload positioning"
      },
      personas: {
        netops: {
          line: "Understand application dependencies before enforcing east-west policy across hybrid infrastructure.",
          symptom: "Network teams are asked to segment dynamic workloads without an accurate map of application dependencies.",
          proof: { metric: "Segmentation change confidence", before: "Static rules are changed with incomplete dependency context", after: "Observed dependencies and policy testing reduce change uncertainty" }
        },
        cio: {
          line: "Reduce the operational drag and outage risk of protecting applications across changing infrastructure.",
          symptom: "Security policy struggles to keep pace as applications move across on-premises and cloud environments.",
          proof: { metric: "Security-policy agility", before: "Protection depends on manual discovery and environment-specific rules", after: "Adaptive policy supports changing application environments" }
        },
        ciso: {
          line: "Constrain east-west movement with workload-aware policy and distributed enforcement.",
          symptom: "Perimeter controls do not provide enough visibility or control inside modern application environments.",
          proof: { metric: "East-west application exposure", before: "Limited workload context and broad internal reachability", after: "Workload-aware segmentation narrows permitted communication paths" }
        }
      },
      useCases: ["Zero Trust Security", "Data Center Modernization"],
      bundles: [],
      families: ["hypershield", "secure-workload"],
      signals: { has: ["secure-workload"], missing: ["hypershield"] },
      maturityNext: "threat-dwell-time"
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
        netops: {
          line: "Validate Webex media reachability and apply appropriate QoS across Wi-Fi, WAN, firewall, and internet paths.",
          symptom: "Hybrid-meeting quality depends on network readiness, but media-path and QoS evidence is often missing.",
          proof: { metric: "Network readiness for hybrid meetings", before: "Media paths and real-time traffic handling are not validated", after: "Webex reachability, preferred UDP transport, and QoS treatment are documented" }
        },
        cio: {
          line: "Improve the usefulness of meeting spaces and participation for in-room and remote employees.",
          symptom: "Meeting spaces are underused while remote participants struggle to be seen and heard equally.",
          proof: { metric: "Meeting-space value and participation", before: "Inconsistent room use and unequal remote participation", after: "Room intelligence and AI-assisted audio/video improve the hybrid experience" }
        },
        ciso: {
          line: "Use managed room endpoints with centralized configuration, updates, and access controls.",
          symptom: "Unmanaged room PCs and unapproved meeting tools can expose meeting data and weaken device governance.",
          proof: { metric: "Meeting endpoint governance", before: "Inconsistent patching, configuration, and application control", after: "Centrally managed room devices with policy and lifecycle visibility" }
        }
      },
      useCases: ["Hybrid Work"],
      bundles: ["Hybrid Work Suite"],
      families: ["room-systems", "desk-devices", "webex-meetings", "webex-app", "cisco-headsets"],
      refArch: "Hybrid Work",
      signals: { has: ["webex-app"], missing: ["room-systems"] },
      dcloudPath: "hybrid-work",
      maturityNext: "room-quality"
    },
    {
      id: "pbx-eol",
      pillar: "workplaces",
      symptom: "The calling environment must stay current, secure, resilient, and supportable without forcing a deployment model that conflicts with operational or regulatory requirements.",
      outcome: "A modern calling architecture aligned to business needs across supported on-premises, cloud, and hybrid deployment models.",
      proof: {
        metric: "Calling architecture fit & lifecycle",
        before: "Aging releases or endpoints, fragmented lifecycle practices, or an operating model that no longer fits requirements",
        after: "A supported calling platform and current phones with documented security, resiliency, and lifecycle controls",
        source: "Cisco Unified CM 15 + Webex Calling + Cisco Desk Phone 9800 official guidance"
      },
      personas: {
        netops: {
          line: "Modernize voice within the selected architecture by validating QoS, reachability, redundancy, survivability, and operational ownership.",
          symptom: "Voice reliability depends on network readiness and resilient call control whether services run on premises, in the cloud, or across both.",
          proof: { metric: "Calling-service readiness", before: "Latency, jitter, loss, reachability, failover, and ownership are inconsistently validated", after: "Transport, call-control resiliency, and escalation boundaries are documented for the chosen design" }
        },
        cio: {
          line: "Choose the right on-premises, cloud, or hybrid operating model while delivering a consistent, modern calling experience.",
          symptom: "Calling must evolve without compromising data sovereignty, regulatory obligations, resiliency, critical integrations, or existing investment.",
          proof: { metric: "Architecture alignment", before: "Modernization is framed as a cloud-only decision", after: "The deployment model is selected against business, regulatory, technical, and lifecycle requirements" }
        },
        ciso: {
          line: "Harden and govern calling across supported on-premises, cloud, and hybrid architectures.",
          symptom: "Calling security depends on supported software, current endpoints, identity controls, certificates, administrative access, and correctly configured signaling and media protection.",
          proof: { metric: "Calling security posture", before: "Release currency, endpoint security, certificates, access, and encryption settings are inconsistent", after: "Supported releases, current endpoints, role-scoped administration, and documented TLS and SRTP policy where supported" }
        }
      },
      useCases: ["Hybrid Work", "Digital Transformation"],
      bundles: [],
      families: ["unified-cm", "webex-calling", "ip-phones", "webex-app"],
      refArch: "Hybrid Work",
      signals: { has: ["ip-phones"], missing: [] },
      dcloudPath: "hybrid-work",
      maturityNext: "hybrid-meeting-equity"
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
        netops: {
          line: "Assure resilient, low-latency connectivity for agent desktops and media while CX owners manage routing and agent workflows.",
          symptom: "Agent and customer media quality suffers when internet, WAN, QoS, or cloud-service reachability is not ready.",
          proof: { metric: "Contact-center network readiness", before: "Bandwidth, latency, jitter, loss, and firewall requirements are unvalidated", after: "Agent and media paths are assessed with clear escalation boundaries" }
        },
        cio: {
          line: "Differentiate on customer experience and lower cost-to-serve.",
          symptom: "Poor customer experience raises cost-to-serve and drives churn.",
          proof: { metric: "Customer effort & cost-to-serve", before: "Voice-only queues; agents lack context", after: "AI routing, digital channels, and self-service deflection" }
        },
        ciso: {
          line: "Apply role-based agent access and protect customer interactions across voice and digital channels.",
          symptom: "Customer conversations may contain regulated data that must be controlled across agents, recordings, and digital channels.",
          proof: { metric: "Contact-center data protection", before: "Inconsistent controls for sensitive interaction data", after: "Role-based access plus encryption, masking, and channel controls support compliance" }
        }
      },
      useCases: ["Contact Center", "Digital Transformation"],
      bundles: ["Cloud Contact Center"],
      families: ["webex-cc", "webex-connect"],
      signals: { has: ["webex-calling"], missing: ["webex-cc"] },
      dcloudPath: "contact-center",
      maturityNext: null
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
        source: "Webex Control Hub troubleshooting + ThousandEyes network-path integration"
      },
      personas: {
        netops: {
          line: "See device health and WAN path health side by side.",
          symptom: "A bad exec meeting means blame bounces between collab, network, and ISP — landing on you.",
          proof: { metric: "Time to root-cause a bad meeting", before: "Blame bounces between collab, network, and ISP", after: "Correlated device + path evidence in one investigation" }
        },
        cio: {
          line: "Reduce disruption in high-visibility meetings and shorten escalation time when quality degrades.",
          symptom: "Quality failures in executive and all-hands meetings are highly visible and difficult to explain quickly.",
          proof: { metric: "Business impact of meeting-quality incidents", before: "High-visibility failures trigger long, cross-team escalations", after: "Participant, device, media, and network-path evidence speeds triage" }
        },
        ciso: {
          line: "Use role-scoped Control Hub access and centrally managed diagnostics instead of ad hoc troubleshooting access.",
          symptom: "Meeting diagnostics contain device and user telemetry that requires governed administrative access.",
          proof: { metric: "Diagnostic access governance", before: "Troubleshooting evidence is gathered through ad hoc tools and broad access", after: "Role-scoped administration and centralized telemetry support investigation" }
        }
      },
      useCases: ["Hybrid Work", "SD-WAN / SASE"],
      bundles: ["Hybrid Work Suite"],
      families: ["room-systems", "thousandeyes", "webex-meetings"],
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
        netops: {
          line: "Non-blocking, low-latency fabric designed for RDMA/AI traffic.",
          symptom: "GPU clusters need lossless, low-latency fabric you can't hand-build.",
          proof: { metric: "AI fabric readiness", before: "Congested, hand-built fabrics that starve GPUs", after: "Validated non-blocking fabric for RDMA/AI traffic" }
        },
        cio: {
          line: "Stand up AI initiatives on infrastructure that won't be the bottleneck.",
          symptom: "AI initiatives stall because the data center isn't ready for them.",
          proof: { metric: "Time-to-stand-up AI infrastructure", before: "Infrastructure is the bottleneck for AI", after: "Validated AI-ready fabric + compute that scales" }
        },
        ciso: {
          line: "Design observable network boundaries and defined enforcement points around high-value AI workloads.",
          symptom: "AI infrastructure is being designed before data flows, trust boundaries, and security enforcement points are agreed.",
          proof: { metric: "AI infrastructure security readiness", before: "Security requirements are added after the fabric and compute design", after: "The architecture documents flows, boundaries, telemetry, and enforcement integration" }
        }
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
      id: "hyperflex-migration",
      pillar: "ai-dc",
      symptom: "HyperFlex Data Platform is past end of software maintenance, but critical workloads still depend on it.",
      outcome: "A planned migration from HyperFlex to a supported platform before the February 2029 last date of support.",
      proof: {
        metric: "HyperFlex lifecycle risk",
        before: "HXDP remains in production without new maintenance releases or bug fixes after September 2025",
        after: "Workloads follow a tested migration plan to Nutanix on Cisco UCS or another supported platform",
        source: "Cisco HyperFlex Data Platform end-of-life notice and migration guidance"
      },
      personas: {
        netops: {
          line: "Inventory dependencies, validate the target design, and sequence migration without creating an avoidable outage.",
          symptom: "The HyperFlex cluster still runs important workloads, but patches and maintenance releases have ended.",
          proof: { metric: "Migration readiness", before: "Dependencies, capacity, and rollback requirements are not documented", after: "A validated target, workload sequence, and rollback plan guide migration" }
        },
        cio: {
          line: "Move critical workloads off an aging platform on a deliberate timeline rather than through an emergency project.",
          symptom: "A supported-until-2029 platform can still become a business risk if migration planning starts too late.",
          proof: { metric: "Lifecycle planning risk", before: "Migration is deferred while support and skills narrow", after: "Funding, platform choice, and workload moves are planned against lifecycle dates" }
        },
        ciso: {
          line: "Reduce exposure created by infrastructure that no longer receives software maintenance fixes.",
          symptom: "HXDP no longer receives maintenance releases or bug fixes, increasing the importance of compensating controls and migration.",
          proof: { metric: "Unsupported-software exposure", before: "Production workloads depend on software past end of maintenance", after: "Compensating controls and migration reduce time on the aging platform" }
        }
      },
      useCases: ["Data Center Modernization"],
      bundles: ["Data Center Modernization"],
      families: ["hyperflex", "ucs", "intersight"],
      signals: { has: ["hyperflex"], missing: ["ucs"] },
      dcloudPath: "dc-modernization",
      maturityNext: "dc-sprawl"
    },
    {
      id: "dc-sprawl",
      pillar: "ai-dc",
      symptom: "The data center is a sprawl of legacy silos that are slow and costly to operate.",
      outcome: "Policy-based data-center networking and cloud-operated compute management with clearer lifecycle control.",
      proof: {
        metric: "Data center operational complexity",
        before: "Device-by-device management across disconnected silos",
        after: "Policy-based fabric and cloud-operated compute management",
        source: "Cisco Data Center Modernization positioning"
      },
      personas: {
        netops: {
          line: "Automate fabric and compute from a single operations plane.",
          symptom: "You manage the data center device-by-device across disconnected silos.",
          proof: { metric: "Data-center operational complexity", before: "Device-by-device management across separate network and compute tools", after: "Policy-based fabric with centralized compute lifecycle operations" }
        },
        cio: {
          line: "Improve lifecycle control and service delivery without assuming a single infrastructure model fits every workload.",
          symptom: "The legacy data center is slow to change and expensive to run.",
          proof: { metric: "Data-center agility", before: "Siloed operations slow changes and obscure lifecycle costs", after: "Standardized platforms and policy make service delivery and lifecycle decisions easier" }
        },
        ciso: {
          line: "Consistent policy and workload protection across the estate.",
          symptom: "Inconsistent policy across data-center silos leaves workloads exposed.",
          proof: { metric: "Workload-policy consistency", before: "Different controls and visibility across infrastructure domains", after: "Policy and workload context are applied more consistently across supported environments" }
        }
      },
      useCases: ["Data Center Modernization", "Data Center Networking", "Network Automation"],
      bundles: ["Data Center Modernization"],
      families: ["nexus", "aci", "ucs", "intersight", "multicloud-defense"],
      refArch: "Data Center Modernization",
      signals: { has: ["ucs"], missing: ["intersight"] },
      dcloudPath: "dc-modernization",
      maturityNext: "ai-infra-ready"
    },
    {
      id: "ai-fabric-bottleneck",
      pillar: "ai-dc",
      symptom: "GPU training jobs stall and no one can tell if the fabric is the bottleneck.",
      outcome: "AI-fabric telemetry and congestion analytics that help isolate network bottlenecks affecting GPU workloads.",
      proof: {
        metric: "AI job throughput lost to congestion",
        before: "Blind to ECN/buffer pressure on the fabric",
        after: "Fabric-wide congestion scoring, ECN/PFC visibility, and consistent QoS templates",
        source: "Cisco Nexus Dashboard / AI fabric positioning"
      },
      personas: {
        netops: {
          line: "Use ECN/PFC statistics, congestion scoring, and microburst telemetry to isolate fabric bottlenecks.",
          symptom: "When AI jobs stall, you're blind to ECN and buffer pressure on the fabric.",
          proof: { metric: "Fabric visibility for AI", before: "Congestion symptoms require device-by-device investigation", after: "Nexus Dashboard correlates congestion indicators across the fabric" }
        },
        cio: {
          line: "Reduce avoidable GPU idle time caused by fabric congestion and configuration inconsistency.",
          symptom: "Stalled GPU jobs waste some of your most expensive compute.",
          proof: { metric: "Infrastructure time lost to fabric issues", before: "GPU jobs slow while teams isolate network causes", after: "Faster congestion diagnosis and consistent fabric templates reduce avoidable delay" }
        },
        ciso: {
          line: "Make AI east-west traffic observable so segmentation and anomaly investigations have usable network context.",
          symptom: "High-volume AI traffic can obscure unusual communication paths if the fabric lacks granular telemetry.",
          proof: { metric: "AI traffic visibility", before: "Limited context for traffic anomalies inside the AI fabric", after: "Granular fabric telemetry supports investigation and policy validation" }
        }
      },
      useCases: ["AI Networking", "Data Center Networking"],
      bundles: ["AI-Ready Data Center Network"],
      families: ["nexus", "nexus-one", "nexus-dashboard", "silicon-one"],
      signals: { has: ["nexus"], missing: ["nexus-dashboard"] },
      dcloudPath: "ai-networking",
      maturityNext: "observability-blindspots"
    },

    /* ── Industrial / IoT ──────────────────────────────────────────── */
    {
      id: "ot-blind",
      pillar: "resilience",
      symptom: "You can't see or secure the OT devices running the plant floor.",
      outcome: "Passive OT asset visibility and identity-based segmentation across industrial networks.",
      proof: {
        metric: "OT asset visibility & exposure",
        before: "Unknown industrial assets on flat OT networks",
        after: "Continuously observed OT inventory with segmentation and monitoring",
        source: "Cisco Cyber Vision + Industrial Ethernet + ISE positioning"
      },
      personas: {
        netops: {
          line: "Ruggedized networking with built-in OT discovery.",
          symptom: "The plant floor needs rugged networking and you can't even see what's on it.",
          proof: { metric: "OT network operations", before: "Flat OT networks with unknown assets", after: "Ruggedized networking with built-in OT discovery" }
        },
        cio: {
          line: "Keep production running while connecting the plant safely.",
          symptom: "You must connect the plant without risking a production outage.",
          proof: { metric: "Operational risk of OT connectivity", before: "New connectivity is delayed because dependencies and downtime risk are unclear", after: "Passive visibility and phased segmentation support change planning without active probing" }
        },
        ciso: {
          line: "See every OT asset and contain threats before they hit operations.",
          symptom: "Unseen OT assets on flat networks are a serious exposure.",
          proof: { metric: "OT asset visibility and exposure", before: "Unknown industrial assets on broadly connected OT networks", after: "Passively discovered assets with segmentation and monitoring context" }
        }
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
      outcome: "Cross-domain observability that replaces assumptions with shared evidence and can shorten MTTR.",
      proof: {
        metric: "Mean time to resolution (cross-team)",
        before: "War rooms; each team sees only its own slice",
        after: "One correlated view across app, network, and internet",
        source: "Cisco ThousandEyes + Splunk + AgenticOps positioning"
      },
      personas: {
        netops: {
          line: "Prove it's not the network — or fix it fast when it is.",
          symptom: "In every outage war room, you're stuck proving it isn't the network.",
          proof: { metric: "Cross-team MTTR", before: "War rooms; each team sees only its own slice", after: "One correlated view; prove it or fix it fast" }
        },
        cio: {
          line: "Less downtime and fewer costly war rooms.",
          symptom: "Outages drag on in costly war rooms with no clear owner.",
          proof: { metric: "Downtime & war-room cost", before: "Frequent, drawn-out war rooms", after: "Less downtime and faster resolution" }
        },
        ciso: {
          line: "Bring network, application, and internet telemetry into investigations to reduce critical blind spots.",
          symptom: "Blind spots between domains mean investigations start in the dark.",
          proof: { metric: "Investigation visibility", before: "Security investigations lack application or network-path context", after: "Cross-domain telemetry provides additional evidence for investigation" }
        }
      },
      useCases: ["AI Networking", "SD-WAN / SASE", "Data Center Modernization"],
      bundles: [],
      families: ["thousandeyes", "splunk", "fso", "appdynamics"],
      signals: { has: ["appdynamics"], missing: ["thousandeyes"] },
      dcloudPath: "ai-networking",
      maturityNext: "tool-sprawl-ops"
    },
    {
      id: "tool-sprawl-ops",
      pillar: "resilience",
      symptom: "Operators juggle a dozen dashboards and still can't answer a simple question fast.",
      outcome: "A shared operations workspace for cross-domain evidence, human operators, and AI-assisted investigation.",
      proof: {
        metric: "Consoles per investigation",
        before: "Swivel-chair across many disconnected tools",
        after: "A shared AI-assisted workspace preserves evidence and investigation context",
        source: "Cisco Cloud Control and AI Canvas positioning — Controlled Availability in the United States as of June 2026"
      },
      personas: {
        netops: {
          line: "Use a shared workspace to assemble cross-domain evidence while operators remain in control.",
          symptom: "You swivel-chair across a dozen tools to answer one simple question.",
          proof: { metric: "Handoffs per investigation", before: "Operators copy evidence between disconnected tools and teams", after: "AI Canvas preserves shared evidence and context across the investigation" }
        },
        cio: {
          line: "Get more operational value from existing Cisco domains by reducing handoffs between teams and tools.",
          symptom: "The company pays for multiple operations platforms, yet major incidents still require manual context gathering and repeated handoffs.",
          proof: { metric: "Cross-team investigation effort", before: "Each escalation restarts context gathering in another tool", after: "A shared workspace carries evidence and reasoning across teams" }
        },
        ciso: {
          line: "Bring security context into the same governed investigation workspace used by infrastructure teams.",
          symptom: "Security context lives apart from the ops investigation surface.",
          proof: { metric: "Security-to-operations handoffs", before: "Security and infrastructure teams exchange screenshots and summaries", after: "Shared evidence supports coordinated investigation while domain controls remain separate" }
        }
      },
      useCases: ["Network Automation", "AI Networking"],
      bundles: ["Cloud Control Platform"],
      families: ["cloud-control"],
      signals: { has: ["catalyst-center"], missing: ["cloud-control"] },
      dcloudPath: "ai-networking",
      maturityNext: "unknown-assets"
    },
    {
      id: "unknown-assets",
      pillar: "resilience",
      symptom: "You don't have a reliable inventory of your Cisco estate or its risk exposure.",
      outcome: "A consolidated Cisco asset view with lifecycle, advisory, hardening, and risk-prioritization insights.",
      proof: {
        metric: "Time to answer \"what do we have and what's at risk?\"",
        before: "Spreadsheets and stale CMDB data",
        after: "A centralized Cisco inventory with lifecycle and prioritized security insights",
        source: "Cisco IQ + Vulnerability Management positioning"
      },
      personas: {
        netops: {
          line: "Know exactly what's deployed and what needs attention.",
          symptom: "You can't reliably say what's deployed or what needs attention.",
          proof: { metric: "Cisco estate inventory confidence", before: "Spreadsheets and stale CMDB records", after: "A centralized Cisco asset view reconciles multiple data sources" }
        },
        cio: {
          line: "Tie Cisco lifecycle, coverage, and risk decisions to a consistent asset view.",
          symptom: "Leadership cannot quickly connect Cisco inventory, support coverage, lifecycle dates, and risk exposure.",
          proof: { metric: "Lifecycle decision readiness", before: "Asset, coverage, and lifecycle data live in separate reports", after: "A consolidated view supports refresh, support, and risk decisions" }
        },
        ciso: {
          line: "Prioritize the vulnerabilities that actually matter to your estate.",
          symptom: "Without an accurate inventory, you can't prioritize real risk.",
          proof: { metric: "Infrastructure risk prioritization", before: "Advisories are reviewed without reliable asset and criticality context", after: "Relevant advisories and hardening findings are mapped to affected Cisco assets" }
        }
      },
      useCases: ["Network Automation"],
      bundles: ["Cisco IQ Operations"],
      families: ["cisco-iq"],
      refArch: "Operational Resilience",
      signals: { has: ["catalyst-center"], missing: ["cisco-iq"] },
      maturityNext: "vulnerability-prioritization"
    },
    {
      id: "vulnerability-prioritization",
      pillar: "resilience",
      symptom: "Vulnerability teams have more findings than they can remediate and limited evidence about which exposures create the most business risk.",
      outcome: "Risk-based vulnerability prioritization that combines exploit intelligence, asset context, and remediation workflows.",
      proof: {
        metric: "Vulnerability remediation focus",
        before: "Teams prioritize mostly by raw severity and scanner volume",
        after: "Risk scoring and asset context focus remediation on the exposures most likely to matter",
        source: "Cisco Vulnerability Management risk-based prioritization positioning"
      },
      personas: {
        netops: {
          line: "Give infrastructure owners a prioritized remediation queue with enough asset and exploit context to plan changes.",
          symptom: "Infrastructure teams receive long scanner lists without clear ownership, exploit context, or change priority.",
          proof: { metric: "Remediation handoff quality", before: "Unprioritized findings move between security and infrastructure teams", after: "Risk-ranked findings include asset context and remediation ownership" }
        },
        cio: {
          line: "Direct limited remediation capacity toward exposures with the greatest potential business impact.",
          symptom: "Leadership cannot tell whether vulnerability backlogs reflect material risk or simply scanner volume.",
          proof: { metric: "Remediation investment focus", before: "Backlog size drives activity without business context", after: "Risk and asset criticality inform remediation priorities" }
        },
        ciso: {
          line: "Prioritize exploitable, consequential exposures and track risk reduction rather than raw finding counts.",
          symptom: "CVSS-only queues overwhelm teams and obscure the exposures most likely to be exploited.",
          proof: { metric: "Risk-based remediation", before: "Severity and volume dominate prioritization", after: "Exploit intelligence, asset context, and risk scoring guide action" }
        }
      },
      useCases: ["Threat Detection & Response", "Zero Trust Security"],
      bundles: ["Cisco IQ Operations"],
      families: ["vuln-mgmt"],
      signals: { has: ["cisco-iq"], missing: ["vuln-mgmt"] },
      maturityNext: "threat-dwell-time"
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
        source: "Splunk AppDynamics + Splunk platform positioning"
      },
      personas: {
        netops: {
          line: "See whether the app or the infrastructure is at fault.",
          symptom: "When the app is slow, you're on the hook to prove the infrastructure is fine.",
          proof: { metric: "Time to isolate app issues", before: "Dev vs ops standoff with separate tools", after: "Correlated app, infra, and network telemetry" }
        },
        cio: {
          line: "Connect application performance to the digital journeys and business services that depend on it.",
          symptom: "Leadership sees customer or employee impact before teams can connect it to the affected application service.",
          proof: { metric: "Business-service visibility", before: "Technical health is disconnected from business-service impact", after: "Application telemetry helps prioritize issues by service and user impact" }
        },
        ciso: {
          line: "Bring application and infrastructure telemetry into security investigations without treating APM as a security control.",
          symptom: "Security teams may lack application-performance context needed to distinguish reliability failures from suspicious behavior.",
          proof: { metric: "Application context in investigations", before: "Security and application teams use separate telemetry and timelines", after: "Splunk can correlate application and infrastructure events with security data" }
        }
      },
      useCases: ["Data Center Modernization", "Cloud Migration"],
      bundles: [],
      families: ["appdynamics", "fso", "splunk", "thousandeyes"],
      signals: { has: ["splunk"], missing: ["appdynamics"] },
      maturityNext: "observability-blindspots"
    }
  ];

  // Official product/solution references used to validate each directional
  // talking point. These are provenance links, not customer-result evidence.
  const OFFICIAL_SOURCE_URLS = {
    "branch-app-experience": "https://www.cisco.com/site/us/en/solutions/networking/sdwan/index.html",
    "campus-manual-ops": "https://www.cisco.com/site/us/en/products/networking/catalyst-center/index.html",
    "wifi-complaints": "https://www.cisco.com/site/us/en/products/networking/wireless/index.html",
    "flat-network-breach": "https://www.cisco.com/c/en/us/td/docs/cloud-systems-management/network-automation-and-management/catalyst-center/cisco-validated-solution-profiles/validated-profile-sda-deployment.html",
    "vpn-overload": "https://www.cisco.com/site/us/en/products/security/secure-access/index.html",
    "threat-dwell-time": "https://docs.xdr.security.cisco.com/Content/Integrations/secure-network-analytics-integration.htm",
    "phishing-email": "https://www.cisco.com/site/us/en/products/security/secure-email/index.html",
    "identity-attacks": "https://www.cisco.com/site/us/en/products/security/duo/index.html",
    "ai-app-security": "https://www.cisco.com/c/en/us/products/collateral/security/ai-defense/ai-defense-so.html",
    "workload-runtime-protection": "https://www.cisco.com/c/en/us/products/collateral/security/hypershield/hypershield-so.html",
    "hybrid-meeting-equity": "https://www.cisco.com/c/en/us/products/collaboration-endpoints/index.html",
    "pbx-eol": "https://www.cisco.com/c/en/us/products/collateral/unified-communications/cisco-collaboration-flex-plan/collaboration-flex-plan3-data-sheet.html",
    "contact-center-cx": "https://www.cisco.com/c/en/us/support/customer-collaboration/webex-contact-center/series.html",
    "room-quality": "https://help.webex.com/en-us/article/pkbkx7/ThousandEyes-integration-with-Webex-services-in-Control-Hub",
    "ai-infra-ready": "https://www.cisco.com/c/en/us/products/collateral/switches/data-center-switches/data-center-networking-ai-ml-so.html",
    "hyperflex-migration": "https://www.cisco.com/c/en/us/td/docs/unified_computing/ucs/sw/SA/SW_Advisory_2025_HX_eol_notice.html",
    "dc-sprawl": "https://www.cisco.com/c/en/us/products/collateral/cloud-systems-management/intersight/solution-overview-c22-742932.html",
    "ai-fabric-bottleneck": "https://www.cisco.com/c/en/us/products/collateral/networking/cloud-networking-switches/nexus-9000-switches/nexus-9000-ai-networking-wp.html",
    "ot-blind": "https://www.cisco.com/site/us/en/products/security/industrial-security/cyber-vision/index.html",
    "observability-blindspots": "https://www.cisco.com/site/us/en/products/networking/software/internet-cloud-intelligence/index.html",
    "tool-sprawl-ops": "https://newsroom.cisco.com/c/r/newsroom/en/us/a/y2026/m06/cisco-unveils-agentic-platform-for-operating-and-defending-critical-it-infrastructure.html",
    "unknown-assets": "https://www.cisco.com/c/en/us/support/docs/cx/cisco-iq/getting-started-guide/cx225778-cisco-iq-getting-started-guide.html",
    "vulnerability-prioritization": "https://www.cisco.com/c/en/us/products/collateral/security/vulnerability-management/security-risk-score-so.html",
    "app-performance": "https://www.cisco.com/c/en/us/solutions/data-center/appdynamics-application-performance-monitoring.html"
  };
  PROBLEMS.forEach(p => {
    if (p.proof) p.proof.sourceUrl = OFFICIAL_SOURCE_URLS[p.id] || "";
  });

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

  /**
   * Normalize a problem to a persona-specific view. A persona entry may be:
   *   - a string        → framed outcome line only (symptom/proof fall back)
   *   - an object        → { symptom?, line?, proof? } with per-field fallback
   * The returned proof merges the shared problem.proof with any persona overrides,
   * so metric/source stay consistent while before/after can be persona-specific.
   */
  function personaView(problem, persona) {
    if (!problem) return { symptom: "", line: "", proof: null };
    const base = {
      symptom: problem.symptom || "",
      line: problem.outcome || "",
      proof: problem.proof || null
    };
    const entry = persona && problem.personas ? problem.personas[persona] : null;
    if (!entry) return base;
    if (typeof entry === "string") return { ...base, line: entry };
    return {
      symptom: entry.symptom || base.symptom,
      line: entry.line || base.line,
      proof: entry.proof ? { ...(base.proof || {}), ...entry.proof } : base.proof
    };
  }

  function personaLine(problem, persona) {
    return personaView(problem, persona).line;
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
    personaView,
    personaLine,
    personaLabel,
    problemNarrative,
    nameOr
  };
})();
