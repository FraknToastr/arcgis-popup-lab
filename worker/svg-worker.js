/*
  LarkGIS code-only SVG service for ArcGIS Online popup experiments.

  Routes:
    /ticker.svg?text=...&status=...&palette=...&speed=...&key=...
    /status.svg?text=...&status=...&key=...
    /telemetry.svg?signal=96&messageLength=42&version=3

  No JavaScript is placed inside the returned SVG. Motion uses declarative SVG
  SMIL animation elements only.
*/

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    let svg;
    if (url.pathname.endsWith("/ticker.svg")) {
      svg = tickerSvg(url.searchParams);
    } else if (url.pathname.endsWith("/status.svg")) {
      svg = statusSvg(url.searchParams);
    } else if (url.pathname.endsWith("/telemetry.svg")) {
      svg = telemetrySvg(url.searchParams);
    } else {
      return new Response("Not found", { status: 404, headers: corsHeaders() });
    }

    return new Response(svg, {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "image/svg+xml; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'"
      }
    });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function cleanText(value, maximum = 220) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function palette(name) {
  const palettes = {
    cyan: ["#00f2fe", "#4facfe", "#67e8f9", "#020713"],
    phosphor: ["#84cc16", "#22c55e", "#bbf7d0", "#03130a"],
    sunset: ["#fb7185", "#f97316", "#fde68a", "#1a0710"],
    magenta: ["#f72585", "#a855f7", "#f5d0fe", "#13051c"],
    rainbow: ["#22d3ee", "#a78bfa", "#fb7185", "#050713"],
    neon: ["#00f2fe", "#7209b7", "#f72585", "#040713"]
  };
  return palettes[String(name || "").toLowerCase()] || palettes.neon;
}

function tickerSvg(params) {
  const message = cleanText(params.get("text"), 220) || "NO MESSAGE";
  const status = cleanText(params.get("status"), 48) || "standby";
  const key = cleanText(params.get("key"), 56) || "NO KEY";
  const speed = clamp(params.get("speed"), 20, 600, 145);
  const duration = Math.max(4, Math.min(30, 1700 / speed));
  const [a, b, c, background] = palette(params.get("palette"));
  const estimatedWidth = Math.max(900, message.length * 31);
  const endX = -estimatedWidth;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="180" viewBox="0 0 900 180" role="img" aria-label="Animated LarkGIS popup ticker">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${background}"/>
      <stop offset="0.55" stop-color="#07152a"/>
      <stop offset="1" stop-color="#160526"/>
    </linearGradient>
    <linearGradient id="textGradient" x1="0" x2="1">
      <stop offset="0" stop-color="${a}">
        <animate attributeName="stop-color" values="${a};${b};${c};${a}" dur="4.2s" repeatCount="indefinite"/>
      </stop>
      <stop offset="0.5" stop-color="${b}">
        <animate attributeName="stop-color" values="${b};${c};${a};${b}" dur="4.2s" repeatCount="indefinite"/>
      </stop>
      <stop offset="1" stop-color="${c}">
        <animate attributeName="stop-color" values="${c};${a};${b};${c}" dur="4.2s" repeatCount="indefinite"/>
      </stop>
    </linearGradient>
    <filter id="glow" x="-30%" y="-80%" width="160%" height="260%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="scanlines" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M0 1H8" stroke="white" stroke-opacity="0.04"/>
    </pattern>
    <clipPath id="stage"><rect x="18" y="54" width="864" height="100" rx="12"/></clipPath>
  </defs>

  <rect width="900" height="180" rx="18" fill="url(#bg)"/>
  <rect width="900" height="180" rx="18" fill="url(#scanlines)"/>
  <rect x="1.5" y="1.5" width="897" height="177" rx="17" fill="none" stroke="${a}" stroke-opacity="0.65" stroke-width="3"/>

  <g opacity="0.8">
    <circle cx="38" cy="26" r="8" fill="none" stroke="${a}" stroke-width="2">
      <animate attributeName="r" values="5;12;5" dur="1.7s" repeatCount="indefinite"/>
      <animate attributeName="stroke-opacity" values="1;0.2;1" dur="1.7s" repeatCount="indefinite"/>
    </circle>
    <text x="58" y="31" fill="${a}" font-family="Arial, sans-serif" font-size="15" font-weight="800">${xml(status.toUpperCase())}</text>
    <text x="882" y="31" text-anchor="end" fill="#94a3b8" font-family="Consolas, monospace" font-size="12">${xml(key)}</text>
  </g>

  <g clip-path="url(#stage)">
    <rect x="18" y="54" width="864" height="100" rx="12" fill="#020713" stroke="${a}" stroke-opacity="0.24"/>
    <text x="900" y="122" fill="url(#textGradient)" stroke="white" stroke-opacity="0.26" stroke-width="1" font-family="Arial Black, Arial, sans-serif" font-size="49" font-weight="900" filter="url(#glow)">
      ${xml(message)}     ${xml(message)}
      <animate attributeName="x" from="900" to="${endX}" dur="${duration.toFixed(2)}s" repeatCount="indefinite"/>
    </text>
  </g>

  <path d="M18 162H882" stroke="url(#textGradient)" stroke-width="4" stroke-linecap="round">
    <animate attributeName="stroke-dasharray" values="0 864;200 664;864 0;0 864" dur="3.4s" repeatCount="indefinite"/>
  </path>
</svg>`;
}

function statusSvg(params) {
  const text = cleanText(params.get("text"), 180) || "NO MESSAGE";
  const key = cleanText(params.get("key"), 56) || "NO KEY";
  const status = cleanText(params.get("status"), 48) || "refresh";
  const timestamp = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 900 300" role="img" aria-label="Refreshable LarkGIS SVG status panel">
  <defs>
    <radialGradient id="halo"><stop offset="0" stop-color="#00f2fe" stop-opacity="0.36"/><stop offset="1" stop-color="#00f2fe" stop-opacity="0"/></radialGradient>
    <linearGradient id="line" x1="0" x2="1"><stop stop-color="#00f2fe"/><stop offset="0.5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f72585"/></linearGradient>
  </defs>
  <rect width="900" height="300" rx="20" fill="#050a18"/>
  <rect x="2" y="2" width="896" height="296" rx="18" fill="none" stroke="#00f2fe" stroke-opacity="0.62" stroke-width="3"/>
  <circle cx="150" cy="150" r="115" fill="url(#halo)"/>
  <circle cx="150" cy="150" r="70" fill="none" stroke="#00f2fe" stroke-width="3" stroke-dasharray="12 10">
    <animateTransform attributeName="transform" type="rotate" from="0 150 150" to="360 150 150" dur="5s" repeatCount="indefinite"/>
  </circle>
  <circle cx="150" cy="150" r="38" fill="#00f2fe" fill-opacity="0.12" stroke="#00f2fe" stroke-width="4">
    <animate attributeName="r" values="28;46;28" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="fill-opacity" values="0.08;0.30;0.08" dur="2s" repeatCount="indefinite"/>
  </circle>
  <path d="M150 150L150 65" stroke="#f72585" stroke-width="4" stroke-linecap="round">
    <animateTransform attributeName="transform" type="rotate" from="0 150 150" to="360 150 150" dur="3.2s" repeatCount="indefinite"/>
  </path>
  <text x="290" y="88" fill="#00f2fe" font-family="Arial, sans-serif" font-size="17" font-weight="800">${xml(status.toUpperCase())}</text>
  <text x="290" y="139" fill="white" font-family="Arial, sans-serif" font-size="30" font-weight="900">${xml(text)}</text>
  <text x="290" y="184" fill="#94a3b8" font-family="Consolas, monospace" font-size="15">${xml(key)}</text>
  <text x="290" y="226" fill="#64748b" font-family="Consolas, monospace" font-size="13">Generated ${xml(timestamp)}</text>
  <path d="M290 250H835" stroke="url(#line)" stroke-width="5" stroke-linecap="round" stroke-dasharray="120 60">
    <animate attributeName="stroke-dashoffset" from="0" to="-360" dur="3s" repeatCount="indefinite"/>
  </path>
</svg>`;
}

function telemetrySvg(params) {
  const signal = clamp(params.get("signal"), 0, 100, 80);
  const messageLength = clamp(params.get("messageLength"), 0, 220, 40);
  const version = clamp(params.get("version"), 0, 100, 0);
  const values = [signal, Math.min(100, messageLength), version];
  const labels = ["SIGNAL", "MESSAGE", "VERSION"];
  const colors = ["#00f2fe", "#a78bfa", "#f72585"];

  const bars = values.map((value, index) => {
    const y = 78 + index * 62;
    const width = value * 6.6;
    return `<text x="46" y="${y + 17}" fill="#94a3b8" font-family="Arial" font-size="14" font-weight="700">${labels[index]}</text>
<rect x="150" y="${y}" width="660" height="28" rx="14" fill="#111c31"/>
<rect x="150" y="${y}" width="0" height="28" rx="14" fill="${colors[index]}">
  <animate attributeName="width" from="0" to="${width}" dur="1.2s" fill="freeze"/>
</rect>
<text x="830" y="${y + 19}" text-anchor="end" fill="white" font-family="Consolas" font-size="15" font-weight="800">${value}</text>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="290" viewBox="0 0 900 290" role="img" aria-label="Animated telemetry bars">
  <rect width="900" height="290" rx="18" fill="#050a18"/>
  <rect x="2" y="2" width="896" height="286" rx="16" fill="none" stroke="#a78bfa" stroke-opacity="0.6" stroke-width="3"/>
  <text x="46" y="45" fill="white" font-family="Arial" font-size="24" font-weight="900">POPUP TELEMETRY</text>
  ${bars}
</svg>`;
}
