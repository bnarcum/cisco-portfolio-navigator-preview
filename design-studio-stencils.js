/**
 * Design Studio v3 — Stencil library with Cisco brand symbols & port anchors
 */
(function () {
  "use strict";

  const VW = 100;
  const VH = 56;

  const SHAPE_TO_SYMBOL = {
    switch: "switch", router: "router", firewall: "shield", ap: "wifi",
    nexus: "fabric", server: "server", codec: "telepresence", display: "monitor",
    camera: "camera", mic: "headset", "ceiling-mic": "ceiling-mic", "table-mic": "table-mic",
    touch: "touch", cloud: "cloud", user: "endpoint", sensor: "cube"
  };

  const STENCIL_SYMBOL = {
    "ceiling-mic": "ceiling-mic", "table-mic": "table-mic",
    "cat-center": "gear", vmanage: "globe", "ise-psn": "key", "ise-pan": "key",
    "umbrella-va": "shield-network", "n9k-spine": "fabric", "n9k-leaf": "fabric",
    apic: "cube", "ucs-x": "server", "fpr-2130": "shield", "fpr-1120": "shield",
    cw9179f: "wifi", mr57: "wifi", "c8200-sdwan": "router", "c8200-sdwan-2": "router",
    mx85: "router", internet: "cloud", mpls: "globe", "users-vlan": "endpoint",
    "credenza-rack": "server",
    "spaces-cloud": "cloud", "spaces-connector": "gear",
    mt10: "cube", mt12: "cube", mt15: "cube", mt20: "cube", mt30: "cube", mt40: "cube",
    mv2: "camera"
  };

  const LAYER_ACCENT = {
    wan: "#02C8FF", security: "#FF007F", core: "#0A60FF", distribution: "#3070E5",
    access: "#02C8FF", dc: "#6080FF", mgmt: "#B4B9C0", collab: "#44CC88", logical: "#8899AA",
    spaces: "#6F42C1", iot: "#16B35A"
  };

  const ROLE_ACCENT = {
    "wan-edge": "#02C8FF", firewall: "#FF007F", ise: "#FF007F", ap: "#02C8FF",
    spine: "#6080FF", leaf: "#6080FF", cloud: "#02C8FF", "collab-switch": "#FF9000",
    sensor: "#16B35A", "spaces-cloud": "#6F42C1", connector: "#6F42C1"
  };

  const ROOM_SHAPE_ACCENT = {
    codec: "#0A60FF", display: "#02C8FF", camera: "#1E8CFF",
    mic: "#2dce5c", "ceiling-mic": "#3dd68c", "table-mic": "#5ce0a0",
    touch: "#A855F7", switch: "#FF9000",
    rack: "#6B7A90", table: "#6B7A90"
  };

  const DISPLAY_SVG = (gid, accent) => `
    <defs>
      <linearGradient id="${gid}-screen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a3050"/>
        <stop offset="45%" stop-color="#0c1a2e"/>
        <stop offset="100%" stop-color="#061018"/>
      </linearGradient>
      <linearGradient id="${gid}-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/>
        <stop offset="35%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect class="ds-node-chassis ds-display-bezel" x="8" y="4" width="84" height="46" rx="4" fill="#1a2538" stroke="${accent}" stroke-width="1.5"/>
    <rect x="12" y="8" width="76" height="38" rx="2" fill="url(#${gid}-screen)" stroke="rgba(2,200,255,0.25)" stroke-width="0.75"/>
    <rect x="12" y="8" width="76" height="38" rx="2" fill="url(#${gid}-glass)" pointer-events="none"/>
    <rect x="38" y="50" width="24" height="4" rx="1" fill="#2a3a50"/>
    <rect x="32" y="54" width="36" height="3" rx="1.5" fill="#1e2a3c" stroke="#3a4a60" stroke-width="0.5"/>`;

  const FURNITURE_SVG = {
    rack: `<rect class="ds-node-chassis" x="22" y="2" width="56" height="52" rx="4" fill="#0a1525" stroke="#506080" stroke-width="1.5"/>
      <rect x="26" y="6" width="48" height="10" rx="2" fill="#12243a" stroke="#304860"/>
      <rect x="26" y="20" width="48" height="10" rx="2" fill="#12243a" stroke="#304860"/>
      <rect x="26" y="34" width="48" height="10" rx="2" fill="#12243a" stroke="#304860"/>
      <circle cx="68" cy="11" r="2" fill="#44cc88"/><circle cx="68" cy="25" r="2" fill="#44cc88"/><circle cx="68" cy="39" r="2" fill="#ff9000"/>`,
    table: `<ellipse cx="50" cy="18" rx="42" ry="10" fill="none" stroke="#506070" stroke-width="1.2" stroke-dasharray="4 3"/>
      <rect class="ds-node-chassis" x="6" y="18" width="88" height="30" rx="6" fill="#1a2535" stroke="#506070" stroke-width="1.5"/>
      <rect x="12" y="24" width="76" height="18" rx="4" fill="#122030" opacity=".6"/>`
  };

  function buildCopperPorts(prefix, count, startX, endX) {
    const ports = [];
    for (let i = 1; i <= count; i++) {
      const t = count === 1 ? 0.5 : startX + ((i - 1) / (count - 1)) * (endX - startX);
      ports.push({ id: `${prefix}${i}`, x: t, y: 1, side: "bottom", type: "copper", poe: true });
    }
    return ports;
  }

  const PORT_PRESETS = {
    "switch-48": [
      ...buildCopperPorts("Gi1/0/", 8, 0.06, 0.74),
      { id: "Gi1/0/23", x: 0.82, y: 1, side: "bottom", type: "copper", poe: true },
      { id: "Gi1/0/24", x: 0.88, y: 1, side: "bottom", type: "copper", poe: true },
      { id: "Gi1/0/47", x: 0.92, y: 1, side: "bottom", type: "copper", poe: true },
      { id: "Gi1/0/48", x: 0.98, y: 1, side: "bottom", type: "copper", poe: true },
      { id: "Te1/1/1", x: 0.25, y: 0, side: "top", type: "sfp", speed: "10G" },
      { id: "Te1/1/2", x: 0.75, y: 0, side: "top", type: "sfp", speed: "10G" },
      { id: "Mgmt", x: 0.5, y: 0, side: "top", type: "mgmt" }
    ],
    "switch-24": [
      ...buildCopperPorts("Gi1/0/", 8, 0.08, 0.88),
      { id: "Gi1/0/23", x: 0.92, y: 1, side: "bottom", type: "copper", poe: true },
      { id: "Gi1/0/24", x: 0.98, y: 1, side: "bottom", type: "copper", poe: true },
      { id: "Te1/1/1", x: 0.5, y: 0, side: "top", type: "sfp", speed: "10G" }
    ],
    "switch-chassis": [
      { id: "Te1/1/1", x: 0.3, y: 0, side: "top", type: "sfp", speed: "10G" },
      { id: "Te1/1/2", x: 0.7, y: 0, side: "top", type: "sfp", speed: "10G" },
      { id: "Gi1/0/1", x: 0.2, y: 1, side: "bottom", type: "copper", poe: true },
      { id: "Gi1/0/48", x: 0.8, y: 1, side: "bottom", type: "copper", poe: true }
    ],
    "router-dual": [
      { id: "Gi0/0/0", x: 0.2, y: 1, side: "bottom", type: "copper" },
      { id: "Gi0/0/1", x: 0.8, y: 1, side: "bottom", type: "copper" },
      { id: "Te0/1/0", x: 0.35, y: 0, side: "top", type: "sfp", speed: "10G" },
      { id: "Te0/1/1", x: 0.65, y: 0, side: "top", type: "sfp", speed: "10G" }
    ],
    "firewall-trio": [
      { id: "outside", x: 0.15, y: 0.5, side: "left", type: "copper" },
      { id: "inside", x: 0.85, y: 0.5, side: "right", type: "copper" },
      { id: "dmz", x: 0.5, y: 1, side: "bottom", type: "copper" }
    ],
    "ap-single": [{ id: "ETH0", x: 0.5, y: 1, side: "bottom", type: "copper", poe: true }],
    "nexus-spine": [
      { id: "Eth1/1", x: 0.2, y: 1, side: "bottom", type: "fiber", speed: "40G" },
      { id: "Eth1/2", x: 0.35, y: 1, side: "bottom", type: "fiber", speed: "40G" },
      { id: "Eth1/32", x: 0.8, y: 1, side: "bottom", type: "fiber", speed: "40G" },
      { id: "Eth1/33", x: 0.2, y: 0, side: "top", type: "fiber", speed: "40G" },
      { id: "Eth1/64", x: 0.8, y: 0, side: "top", type: "fiber", speed: "40G" }
    ],
    "codec-av": [
      { id: "LAN", x: 0.15, y: 1, side: "bottom", type: "copper", poe: true },
      { id: "HDMI1", x: 0.85, y: 0.5, side: "right", type: "hdmi" },
      { id: "HDMI2", x: 0.85, y: 0.7, side: "right", type: "hdmi" },
      { id: "USB", x: 0.5, y: 1, side: "bottom", type: "usb" }
    ],
    "display-hdmi": [
      { id: "HDMI1", x: 0.3, y: 1, side: "bottom", type: "hdmi" },
      { id: "HDMI2", x: 0.7, y: 1, side: "bottom", type: "hdmi" }
    ],
    "cam-hdmi": [{ id: "HDMI", x: 0.5, y: 1, side: "bottom", type: "hdmi" }],
    "mic-poe": [{ id: "ETH", x: 0.5, y: 1, side: "bottom", type: "copper", poe: true }],
    "touch-lan": [{ id: "LAN", x: 0.5, y: 1, side: "bottom", type: "copper", poe: true }],
    "phone-lan": [{ id: "LAN", x: 0.5, y: 1, side: "bottom", type: "copper", poe: true }],
    "generic": [
      { id: "Port1", x: 0.3, y: 1, side: "bottom", type: "copper" },
      { id: "Port2", x: 0.7, y: 1, side: "bottom", type: "copper" }
    ]
  };

  const NETWORK_DEVICES = {
    "c9500-core": { label: "C9500 Core", pid: "C9500-48Y4C", layer: "core", role: "core", shape: "switch", ports: "switch-48", w: 88, h: 48, poeW: 0, rackU: 1 },
    "c9500-core-2": { label: "C9500 Core (B)", pid: "C9500-48Y4C", layer: "core", role: "core", shape: "switch", ports: "switch-48", w: 88, h: 48 },
    "c9400-dist": { label: "C9400 Dist", pid: "C9400-L-C9407R", layer: "distribution", role: "distribution", shape: "switch", ports: "switch-chassis", w: 88, h: 48, rackU: 7 },
    "c9300-access": { label: "C9300 Access", pid: "C9300-48P", layer: "access", role: "access", shape: "switch", ports: "switch-48", w: 88, h: 48, poeW: 740, rackU: 1 },
    "c9200-access": { label: "C9200 Access", pid: "C9200-24P", layer: "access", role: "access", shape: "switch", ports: "switch-24", w: 80, h: 44, poeW: 370, rackU: 1 },
    "c9200-collab": { label: "C9200 Collab SW", pid: "C9200-24P", layer: "collab", role: "collab-switch", shape: "switch", ports: "switch-24", w: 80, h: 44, poeW: 370 },
    "cw9179f": { label: "CW9179F AP", pid: "CW9179F", layer: "access", role: "ap", shape: "ap", ports: "ap-single", w: 72, h: 44, poeW: 25, spacesBeacon: true },
    "mr57": { label: "MR57 AP", pid: "MR57-HW", layer: "access", role: "ap", shape: "ap", ports: "ap-single", w: 72, h: 44, poeW: 25, spacesBeacon: true, mtGateway: true },
    "c8200-sdwan": { label: "C8200 SD-WAN", pid: "C8200-1N-4T", layer: "wan", role: "wan-edge", shape: "router", ports: "router-dual", w: 84, h: 44 },
    "c8200-sdwan-2": { label: "C8200 SD-WAN (B)", pid: "C8200-1N-4T", layer: "wan", role: "wan-edge", shape: "router", ports: "router-dual", w: 84, h: 44 },
    "vmanage": { label: "vManage", pid: "SD-WAN-VMS-SMALL", layer: "mgmt", role: "controller", shape: "server", ports: "generic", w: 72, h: 48, bomEligible: false },
    "cat-center": { label: "Catalyst Center", pid: "DN3-HW-APL", layer: "mgmt", role: "management", shape: "server", ports: "generic", w: 80, h: 48 },
    "ise-psn": { label: "ISE PSN", pid: "ISE-VM-K9", layer: "security", role: "ise", shape: "server", ports: "generic", w: 72, h: 48 },
    "ise-pan": { label: "ISE PAN", pid: "ISE-VM-K9", layer: "security", role: "ise", shape: "server", ports: "generic", w: 72, h: 48 },
    "fpr-2130": { label: "FPR 2130", pid: "FPR-2130", layer: "security", role: "firewall", shape: "firewall", ports: "firewall-trio", w: 88, h: 52 },
    "fpr-1120": { label: "FPR 1120 Branch", pid: "FPR-1120", layer: "security", role: "firewall", shape: "firewall", ports: "firewall-trio", w: 80, h: 48 },
    "n9k-spine": { label: "N9K Spine", pid: "N9K-C9332D-GX2B", layer: "dc", role: "spine", shape: "nexus", ports: "nexus-spine", w: 92, h: 52 },
    "n9k-leaf": { label: "N9K Leaf", pid: "N9K-C93180YC-FX3", layer: "dc", role: "leaf", shape: "nexus", ports: "nexus-spine", w: 92, h: 52 },
    "apic": { label: "APIC Cluster", pid: "APIC-L3", layer: "dc", role: "apic", shape: "server", ports: "generic", w: 72, h: 48 },
    "ucs-x": { label: "UCS X210c", pid: "UCSX-210C-M7SN", layer: "dc", role: "compute", shape: "server", ports: "generic", w: 72, h: 52 },
    "mx85": { label: "Meraki MX85", pid: "MX85-HW", layer: "wan", role: "wan-edge", shape: "router", ports: "router-dual", w: 80, h: 44 },
    "ms250": { label: "MS250 Switch", pid: "MS250-48FP-HW", layer: "access", role: "access", shape: "switch", ports: "switch-48", w: 88, h: 48, poeW: 740 },
    "umbrella-va": { label: "Umbrella VA", pid: "UMB-VA-VM", layer: "security", role: "dns", shape: "cloud", ports: "generic", w: 76, h: 44, bomEligible: false },
    "internet": { label: "Internet / DIA", pid: "N/A-INTERNET", layer: "wan", role: "cloud", shape: "cloud", ports: "generic", w: 80, h: 44 },
    "mpls": { label: "MPLS WAN", pid: "N/A-MPLS", layer: "wan", role: "cloud", shape: "cloud", ports: "generic", w: 80, h: 44 },
    "users-vlan": { label: "Users / VLAN", pid: "N/A-VLAN", layer: "access", role: "logical", shape: "user", ports: "generic", w: 72, h: 48 },

    // ---- Cisco Spaces (location + IoT platform) -----------------------------
    "spaces-cloud": { label: "Cisco Spaces", pid: "N/A-SPACES", layer: "spaces", role: "spaces-cloud", shape: "cloud", ports: "generic", w: 84, h: 46, bomEligible: false, spaces: true, tier: "ACT/SEE/EXTEND/ACT+" },
    "spaces-connector": { label: "Spaces Connector 3", pid: "SPACES-CONNECTOR", layer: "spaces", role: "connector", shape: "server", ports: "generic", w: 76, h: 46, bomEligible: false, spaces: true },
    // Meraki MT environmental/IoT sensors — BLE, require an MR AP or MV camera gateway.
    "mt10": { label: "MT10 Temp/Humidity", pid: "MT10-HW", layer: "iot", role: "sensor", shape: "sensor", ports: "generic", w: 54, h: 40, poeW: 0, spaces: true, gateway: "meraki", sensorOf: "temp/humidity" },
    "mt12": { label: "MT12 Water Leak", pid: "MT12-HW", layer: "iot", role: "sensor", shape: "sensor", ports: "generic", w: 54, h: 40, spaces: true, gateway: "meraki", sensorOf: "water" },
    "mt14": { label: "MT14 Air Quality", pid: "MT14-HW", layer: "iot", role: "sensor", shape: "sensor", ports: "generic", w: 54, h: 40, spaces: true, gateway: "meraki", sensorOf: "air-quality" },
    "mt15": { label: "MT15 Indoor Air", pid: "MT15-HW", layer: "iot", role: "sensor", shape: "sensor", ports: "generic", w: 54, h: 40, spaces: true, gateway: "meraki", sensorOf: "co2/voc" },
    "mt20": { label: "MT20 Door Sensor", pid: "MT20-HW", layer: "iot", role: "sensor", shape: "sensor", ports: "generic", w: 54, h: 40, spaces: true, gateway: "meraki", sensorOf: "door" },
    "mt30": { label: "MT30 Smart Button", pid: "MT30-HW", layer: "iot", role: "sensor", shape: "sensor", ports: "generic", w: 54, h: 40, spaces: true, gateway: "meraki", sensorOf: "button" },
    "mt40": { label: "MT40 Smart Power", pid: "MT40-HW", layer: "iot", role: "sensor", shape: "sensor", ports: "generic", w: 54, h: 40, spaces: true, gateway: "meraki", sensorOf: "power" },
    // Meraki MV camera doubles as an MT gateway and occupancy sensor.
    "mv2": { label: "Meraki MV2 Camera", pid: "MV2-HW", layer: "access", role: "camera", shape: "camera", ports: "ap-single", w: 64, h: 48, poeW: 13, spaces: true, mtGateway: true }
  };

  // ---- Canonical device registry (ROOM) -------------------------------------
  // Each entry is the SINGLE source of truth for a room device. The 3D walk,
  // 2D diagram, cabling, category icons and the intent BOM all read from here
  // instead of re-deriving identity from labels/zones.
  //   mount       — authoritative physical surface (drives 3D placement):
  //                 wall-display | wall-camera | wall-panel | shelf |
  //                 ceiling | table | desk | rack | floor-table | floor-rack
  //   role        — device class (drives category icon + cabling):
  //                 display | camera | microphone | control | codec | phone |
  //                 switch | furniture
  //   model3d     — procedural mesh template key
  //   defaultCount— BOM default the intent can scale (e.g. mics)
  //   aliases     — natural-language phrases the intent maps to this device
  //   variants    — model variants (e.g. Board Pro G2, wall-mount Navigator)
  const ROOM_DEVICES = {
    "room-kit-eq": { label: "Room Kit EQ", pid: "CS-KIT-EQ-K9", shape: "codec", ports: "codec-av", w: 92, h: 52, poeW: 60, mount: "rack", role: "codec", model3d: "codec", aliases: ["room kit eq", "kit eq", "room kit"] },
    "room-kit-pro": { label: "Room Kit Pro G2", pid: "CS-KITPRO-K9", shape: "codec", ports: "codec-av", w: 92, h: 52, poeW: 60, mount: "rack", role: "codec", model3d: "codec", aliases: ["room kit pro", "kit pro"] },
    "room-bar": { label: "Room Bar", pid: "CS-BAR-K9", shape: "codec", ports: "codec-av", w: 84, h: 48, poeW: 45, mount: "shelf", role: "codec", model3d: "codec", aliases: ["room bar", "bar pro", "webex bar"] },
    "board-pro": { label: "Board Pro 75", pid: "CS-BRD-75-K9", shape: "display", ports: "codec-av", w: 104, h: 60, poeW: 45, mount: "wall-display", role: "display", model3d: "display", aliases: ["board pro", "webex board", "board"], variants: { g2: { pid: "CS-BRD-PRO-G2-75", label: "Board Pro G2 75" }, "55": { pid: "CS-BRD-55-K9", label: "Board Pro 55" } } },
    "desk-pro": { label: "Desk Pro", pid: "CS-DESKPRO-K9", shape: "codec", ports: "codec-av", w: 76, h: 48, poeW: 30, mount: "desk", role: "codec", model3d: "display", aliases: ["desk pro"] },
    "desk-mini": { label: "Desk Mini", pid: "CS-DESKMINI-K9", shape: "codec", ports: "codec-av", w: 64, h: 44, poeW: 25, mount: "desk", role: "codec", model3d: "display", aliases: ["desk mini"] },
    "desk-phone": { label: "Desk Phone 9841", pid: "CP-9841-K9", shape: "phone", ports: "phone-lan", w: 52, h: 40, poeW: 8, mount: "desk", role: "phone", model3d: "generic", aliases: ["desk phone", "ip phone", "9841"] },
    "room-vision-ptz": { label: "Room Vision PTZ", pid: "CS-RoomVisionPTZ", shape: "camera", ports: "cam-hdmi", w: 56, h: 52, poeW: 0, mount: "wall-camera", role: "camera", model3d: "camera", aliases: ["room vision", "ptz camera", "ptz"] },
    "quad-cam": { label: "Quad Camera", pid: "CS-QUADCAM-K9", shape: "camera", ports: "cam-hdmi", w: 56, h: 52, mount: "wall-camera", role: "camera", model3d: "camera", aliases: ["quad camera", "quad cam", "quadcam"] },
    "ceiling-mic": { label: "Ceiling Mic Pro", pid: "CS-MIC-CLGPRO", shape: "ceiling-mic", ports: "mic-poe", w: 52, h: 36, poeW: 15, mount: "ceiling", role: "microphone", model3d: "ceiling-mic", cableAnchor: "ceiling", defaultCount: 2, aliases: ["ceiling mic", "ceiling microphone", "ceiling mic pro", "mic pro"] },
    "table-mic": { label: "Table Mic Pro", pid: "CS-MIC-TBLPRO", shape: "table-mic", ports: "mic-poe", w: 48, h: 40, poeW: 10, mount: "table", role: "microphone", model3d: "table-mic", cableAnchor: "table", defaultCount: 2, aliases: ["table mic", "table microphone", "table mic pro"] },
    "touch-10": { label: "Touch 10", pid: "CS-TOUCH10-K9", shape: "touch", ports: "touch-lan", w: 58, h: 42, poeW: 12, mount: "table", role: "control", model3d: "touch", aliases: ["touch 10", "touch panel", "touch controller", "touch10"] },
    "room-navigator": { label: "Room Navigator", pid: "CS-NAV-T-K9", shape: "touch", ports: "touch-lan", w: 58, h: 42, poeW: 12, mount: "table", role: "control", model3d: "touch", aliases: ["navigator", "room navigator", "scheduling panel"], variants: { wall: { mount: "wall-panel", pid: "CS-NAV-W-K9", label: "Room Navigator (Wall)" }, table: { mount: "table", pid: "CS-NAV-T-K9" } } },
    "display-75": { label: "Display 75\"", pid: "DISPLAY-75-4K", shape: "display", ports: "display-hdmi", w: 100, h: 58, ccwEligible: false, decorative: true, mount: "wall-display", role: "display", model3d: "display", aliases: ["display 75", "75 inch display"] },
    "display-86": { label: "Display 86\"", pid: "DISPLAY-86-4K", shape: "display", ports: "display-hdmi", w: 108, h: 62, ccwEligible: false, decorative: true, mount: "wall-display", role: "display", model3d: "display", aliases: ["display 86", "86 inch display"] },
    "credenza-rack": { label: "12U Credenza", pid: "RACK-12U-CRED", shape: "rack", ports: "generic", w: 56, h: 72, ccwEligible: false, decorative: true, mount: "floor-rack", role: "furniture", model3d: "rack" },
    "conf-table-12": { label: "Conf Table (12)", pid: "FURN-TABLE-12", shape: "table", ports: "generic", w: 120, h: 56, ccwEligible: false, decorative: true, mount: "floor-table", role: "furniture", model3d: "table" },
    "conf-table-8": { label: "Huddle Table (8)", pid: "FURN-TABLE-8", shape: "table", ports: "generic", w: 88, h: 48, ccwEligible: false, decorative: true, mount: "floor-table", role: "furniture", model3d: "table" },
    "c9200-collab": { label: "C9200 Collab SW", pid: "C9200-24P", shape: "switch", ports: "switch-24", w: 96, h: 50, poeW: 370, layer: "collab", role: "collab-switch", mount: "rack", model3d: "switch", aliases: ["poe switch", "collab switch", "access switch", "c9200"] }
  };

  /** Canonical 2D/diagram zone that matches a physical mount surface. */
  const MOUNT_TO_ZONE = {
    "wall-display": "display", "wall-camera": "display", "wall-panel": "display",
    shelf: "display", ceiling: "ceiling", table: "table", desk: "desk",
    rack: "rack", "floor-table": "table", "floor-rack": "rack"
  };

  function roomZoneForMount(mount) {
    return MOUNT_TO_ZONE[mount] || "table";
  }

  /**
   * Resolve the canonical profile for a device instance, folding in any model
   * variant (explicit node.variant, or inferred from the instance label/pid).
   * This is the one function every subsystem calls to learn where a device
   * mounts, what it is, and how to render/cable it.
   */
  function deviceProfile(stencilId, node) {
    const def = getDef(stencilId, "room");
    if (!def) return null;
    let mount = def.mount || null;
    let pid = def.pid;
    let label = def.label;
    const role = def.role || null;
    const model3d = def.model3d || null;

    if (def.variants) {
      let vKey = node?.variant && def.variants[node.variant] ? node.variant : null;
      if (!vKey) {
        const hay = `${node?.label || ""} ${node?.pid || ""}`.toLowerCase();
        for (const k of Object.keys(def.variants)) {
          if (k === "table") continue;
          const v = def.variants[k];
          if ((v.pid && node?.pid === v.pid) || new RegExp(`\\b${k}\\b`, "i").test(hay)) { vKey = k; break; }
        }
      }
      if (vKey) {
        const v = def.variants[vKey];
        mount = v.mount || mount;
        pid = v.pid || pid;
        label = v.label || label;
      }
    }
    return {
      stencilId, mount, role, model3d, pid, label,
      cableAnchor: def.cableAnchor || null,
      zone: roomZoneForMount(mount)
    };
  }

  const FAMILY_TO_STENCIL = {
    "catalyst-core": "c9500-core", "catalyst-access": "c9300-access", "catalyst-wireless": "cw9179f",
    "catalyst-center": "cat-center", "sdwan": "c8200-sdwan", "secure-routers": "fpr-2130",
    "isr-routers": "c8200-sdwan", "wan-routers": "c8200-sdwan-2",
    "sf-enterprise": "fpr-2130", "sf-branch": "fpr-1120",
    "ise": "ise-psn", "nexus": "n9k-leaf", "nexus-one": "n9k-spine", "aci": "apic",
    "ucs": "ucs-x", "meraki-mx": "mx85", "meraki-switches": "ms250", "meraki-wireless": "mr57",
    "umbrella": "umbrella-va", "room-systems": "room-kit-eq", "desk-devices": "desk-pro",
    "conf-phones": "users-vlan", "ip-phones": "users-vlan", "cisco-headsets": "users-vlan",
    "industrial-eth": "c9300-access"
  };

  function getPorts(stencilId, mode) {
    const def = getDef(stencilId, mode);
    if (!def) return PORT_PRESETS.generic;
    return PORT_PRESETS[def.ports] || PORT_PRESETS.generic;
  }

  function getDef(stencilId, mode) {
    if (ROOM_DEVICES[stencilId]) return ROOM_DEVICES[stencilId];
    if (NETWORK_DEVICES[stencilId]) return NETWORK_DEVICES[stencilId];
    const mapped = FAMILY_TO_STENCIL[stencilId];
    if (mapped && NETWORK_DEVICES[mapped]) return NETWORK_DEVICES[mapped];
    return null;
  }

  function portExists(stencilId, mode, portId) {
    if (!portId) return true;
    return getPorts(stencilId, mode).some(p => p.id === portId);
  }

  function portXY(node, portId) {
    const mode = node.canvas === "room" ? "room" : "network";
    const ports = getPorts(node.stencilId, mode);
    const w = node.w || 76, h = node.h || 46;
    const p = ports.find(x => x.id === portId) || ports[0];
    if (!p) return { x: node.x + w / 2, y: node.y + h / 2 };
    let px = node.x + p.x * w, py = node.y + p.y * h;
    if (p.side === "top") py = node.y;
    if (p.side === "bottom") py = node.y + h;
    if (p.side === "left") px = node.x;
    if (p.side === "right") px = node.x + w;
    return { x: px, y: py };
  }

  function resolveSymbolId(def, stencilId) {
    if (stencilId && STENCIL_SYMBOL[stencilId]) return STENCIL_SYMBOL[stencilId];
    const shape = def?.shape || "switch";
    if (shape === "table" || shape === "rack") return null;
    return SHAPE_TO_SYMBOL[shape] || "switch";
  }

  function resolveAccent(def) {
    const shape = def?.shape;
    if (shape && ROOM_SHAPE_ACCENT[shape]) return ROOM_SHAPE_ACCENT[shape];
    return LAYER_ACCENT[def?.layer] || ROLE_ACCENT[def?.role] || "#02C8FF";
  }

  const BLOCKED_BOM_PID = /^(DISPLAY-|FURN-|RACK-|CAB-|A-FLEX-|CON-|PID-|CS-AMP|UMB-VA|SD-WAN-VMS)/i;

  function isCcwEligible(def, pid) {
    const p = pid || def?.pid || "";
    if (!p || p.startsWith("N/A")) return false;
    if (def?.ccwEligible === false || def?.decorative || def?.bomEligible === false) return false;
    if (BLOCKED_BOM_PID.test(p)) return false;
    return true;
  }

  function renderSymbolPreview(symbolId, accent, size, stencilId, def) {
    const d = def || (stencilId ? getDef(stencilId, "network") : null);
    if (stencilId && window.__DS_PHOTOS?.resolveUrl) {
      const url = window.__DS_PHOTOS.resolveUrl(stencilId, d);
      if (url) {
        const sz = size || 22;
        return `<span class="ds-st-photo-wrap"><img class="ds-st-photo" src="${url.replace(/"/g, "&quot;")}" width="${sz}" height="${sz}" alt="" loading="lazy"/></span>`;
      }
    }
    const sym = symbolId || "switch";
    const color = accent || "#02C8FF";
    const sz = size || 22;
    return `<svg class="ds-st-icon-svg" viewBox="0 0 80 80" width="${sz}" height="${sz}" aria-hidden="true" style="color:${color}">
      <use href="#icon-${sym}"/></svg>`;
  }

  function renderDeviceSvg(def, w, h, selected, stencilId) {
    const photoUrl = window.__DS_PHOTOS?.resolveUrl?.(stencilId, def);
    if (photoUrl && window.__DS_PHOTOS?.renderDeviceSvg) {
      return window.__DS_PHOTOS.renderDeviceSvg(def, w, h, selected, stencilId, photoUrl);
    }
    const shape = def?.shape || "switch";
    const sx = w / VW;
    const sy = h / VH;
    const scale = Math.min(sx, sy);
    const padX = (w - VW * scale) / 2;
    const padY = (h - VH * scale) / 2;
    const xform = `translate(${padX},${padY}) scale(${scale})`;

    if (shape === "table" || shape === "rack") {
      const inner = FURNITURE_SVG[shape] || FURNITURE_SVG.table;
      const sel = selected ? " ds-node-selected" : "";
      return `<g class="ds-device ds-furniture${sel}" transform="${xform}">${inner}</g>`;
    }

    const sym = resolveSymbolId(def, stencilId) || "switch";
    const accent = resolveAccent(def);
    const gid = "dsg-" + String(stencilId || shape).replace(/[^a-z0-9]/gi, "").slice(0, 12);
    const sel = selected ? " ds-node-selected" : "";

    if (shape === "display") {
      const ring = selected ? `<rect x="7" y="3" width="86" height="48" rx="5" fill="none" stroke="${accent}" stroke-width="1.75" opacity="0.7"/>` : "";
      return `<g class="ds-device ds-display${sel}" transform="${xform}">${DISPLAY_SVG(gid, accent)}${ring}</g>`;
    }

    const isRoomShape = ["codec", "camera", "mic", "ceiling-mic", "table-mic", "touch", "switch"].includes(shape);
    const isCeilingMic = shape === "ceiling-mic";
    const iconScale = isCeilingMic ? 0.55 : isRoomShape ? 0.5 : 0.45;
    const iconDraw = 80 * iconScale;
    const iconX = (VW - iconDraw) / 2;
    const iconY = (VH - iconDraw) / 2;

    return `<g class="ds-device${sel}" transform="${xform}">
      <defs>
        <linearGradient id="${gid}-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${accent}" stop-opacity="${isRoomShape ? "0.22" : "0.12"}"/>
          <stop offset="42%" stop-color="#142f52"/>
          <stop offset="100%" stop-color="#07182D"/>
        </linearGradient>
        <linearGradient id="${gid}-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <${isCeilingMic ? "ellipse" : "rect"} class="ds-node-chassis" ${isCeilingMic
        ? `cx="50" cy="28" rx="46" ry="24"`
        : `x="1" y="1" width="${VW - 2}" height="${VH - 2}" rx="8"`}
        fill="url(#${gid}-bg)" stroke="${accent}" stroke-width="${isRoomShape ? "1.5" : "1.25"}" opacity="0.98"/>
      ${isCeilingMic ? "" : `<rect x="1" y="1" width="${VW - 2}" height="${VH - 2}" rx="8" fill="url(#${gid}-shine)" pointer-events="none"/>
      <rect x="0" y="9" width="4" height="${VH - 18}" rx="2" fill="${accent}" opacity="0.75"/>`}
      <rect x="10" y="${VH - 9}" width="${VW - 20}" height="2.5" rx="1" fill="${accent}" opacity="0.28"/>
      <g class="ds-node-symbol" style="color:${accent}" transform="translate(${iconX},${iconY}) scale(${iconScale})">
        <use href="#icon-${sym}" width="80" height="80"/>
      </g>
      ${selected ? (isCeilingMic
        ? `<ellipse cx="50" cy="28" rx="47" ry="25" fill="none" stroke="${accent}" stroke-width="1.75" opacity="0.6"/>`
        : `<rect x="0.5" y="0.5" width="${VW - 1}" height="${VH - 1}" rx="9" fill="none" stroke="${accent}" stroke-width="1.75" opacity="0.6"/>`) : ""}
    </g>`;
  }

  function renderPorts(node, mode, linkHot) {
    const ports = getPorts(node.stencilId, mode);
    const w = node.w || 76, h = node.h || 46;
    return ports.map(p => {
      let cx = p.x * w, cy = p.y * h;
      if (p.side === "top") cy = 0;
      if (p.side === "bottom") cy = h;
      if (p.side === "left") cx = 0;
      if (p.side === "right") cx = w;
      const hot = linkHot === p.id ? " hot" : "";
      const color = p.poe ? "#ff9000" : p.type === "fiber" ? "#6080ff" : p.type === "hdmi" ? "#44cc88" : "#8899aa";
      return `<g class="ds-port-wrap">
        <circle class="ds-port-halo" cx="${cx}" cy="${cy}" r="6" fill="${color}" opacity=".12"/>
        <circle class="ds-port${hot}" data-port="${p.id}" cx="${cx}" cy="${cy}" r="3.5" fill="${color}" stroke="#fff" stroke-width=".75">
          <title>${p.id}${p.speed ? " " + p.speed : ""}${p.poe ? " PoE" : ""}</title></circle>
      </g>`;
    }).join("");
  }

  function buildCatalogStencils() {
    const families = window.__cpnDesignCatalog?.families?.() || [];
    const seen = new Set(Object.keys(NETWORK_DEVICES));
    const out = Object.entries(NETWORK_DEVICES).map(([id, d]) => ({
      id, label: d.label, pid: d.pid, layer: d.layer, role: d.role,
      symbolId: resolveSymbolId(d, id),
      accent: resolveAccent(d),
      category: d.layer === "security" ? "security" : "networking", familyId: id, w: d.w, h: d.h
    }));
    families.forEach(f => {
      const sid = FAMILY_TO_STENCIL[f.id] || f.id;
      if (seen.has(sid)) return;
      seen.add(sid);
      const def = NETWORK_DEVICES[sid];
      out.push({
        id: f.id, label: f.name.length > 22 ? f.name.slice(0, 20) + "…" : f.name,
        layer: f.category === "security" ? "security" : f.category === "collaboration" ? "collab" : "access",
        pid: def?.pid || "", bomEligible: !!def?.pid, symbolId: resolveSymbolId(def, sid) || "switch",
        accent: resolveAccent(def), familyId: f.id, w: 76, h: 46
      });
    });
    return out;
  }

  function buildRoomStencils() {
    return Object.entries(ROOM_DEVICES).map(([id, d]) => ({
      id, label: d.label, pid: d.pid,
      symbolId: resolveSymbolId(d, id),
      accent: resolveAccent(d),
      w: d.w, h: d.h, layer: "collab"
    }));
  }

  function suggestMedia(fromNode, toNode, fromPort, toPort) {
    const fDef = getDef(fromNode.stencilId, fromNode.canvas === "room" ? "room" : "network");
    const tDef = getDef(toNode.stencilId, toNode.canvas === "room" ? "room" : "network");
    const fRole = fDef?.role, tRole = tDef?.role;
    if (/hdmi/i.test(fromPort || "") || /hdmi/i.test(toPort || "")) return "hdmi";
    if (/spk/i.test(fromPort || "") || /spk/i.test(toPort || "")) return "speaker";
    if (fRole === "ap" || tRole === "ap" || /poe|lan|eth/i.test(toPort || "")) return "cat6";
    if (fRole === "spine" || tRole === "spine" || fRole === "leaf" || tRole === "leaf") return "fiber-40g";
    if (fRole === "core" || tRole === "core" || fRole === "distribution") return "fiber-sm";
    if (fRole === "wan-edge" || tRole === "cloud") return "fiber-sm";
    return "cat6a";
  }

  window.__DS_STENCILS = {
    NETWORK_DEVICES, ROOM_DEVICES, FAMILY_TO_STENCIL, PORT_PRESETS,
    getDef, getPorts, portXY, portExists, renderDeviceSvg, renderPorts,
    buildCatalogStencils, buildRoomStencils, suggestMedia,
    resolveSymbolId, resolveAccent, renderSymbolPreview, LAYER_ACCENT, isCcwEligible,
    deviceProfile, roomZoneForMount, MOUNT_TO_ZONE
  };
})();
