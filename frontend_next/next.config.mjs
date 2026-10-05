import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// EzeFloor uses one environment file for the whole repository: <project>/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const rootEnvPath = path.join(projectRoot, ".env");

function loadRootEnv() {
  if (!fs.existsSync(rootEnvPath)) return;

  const content = fs.readFileSync(rootEnvPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();

const csv = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
const allowedDevOrigins = csv(process.env.NEXT_ALLOWED_DEV_ORIGINS);
const backendUrl = String(process.env.BACKEND_URL || "").trim().replace(/\/$/, "");
if (!backendUrl) {
  throw new Error("BACKEND_URL must be configured in the repository root .env");
}
const proxyTimeout = Number(process.env.NEXT_PROXY_TIMEOUT_MS || 0);
const proxyMaxBodySize = process.env.NEXT_PROXY_MAX_BODY_SIZE || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "",
    NEXT_PUBLIC_PROCUREMENT_WEB_URL: process.env.PROCUREMENT_WEB_URL || "",
    NEXT_PUBLIC_PROCUREMENT_DEFAULT_EMPLOYEE_ID: process.env.PROCUREMENT_DEFAULT_EMPLOYEE_ID || "",
    NEXT_PUBLIC_SSO_DEFAULT_EMPLOYEE_ID: process.env.SSO_DEFAULT_EMPLOYEE_ID || "",
    NEXT_PUBLIC_DEFAULT_OFFICE_CODE: process.env.DEFAULT_OFFICE_CODE || "",
    NEXT_PUBLIC_TASKLIST_ALLOWED_ORIGINS: process.env.TASKLIST_ALLOWED_ORIGINS || "",
  },
  // CAD/BIM client-side application — all rendering is client-side
  allowedDevOrigins,
  // API Rewrites — proxy all backend endpoints to Python backend on :8090
  async rewrites() {
    return [
      // Main API routes
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },

      // Auth endpoints
      { source: "/login", destination: `${backendUrl}/login` },
      { source: "/signup", destination: `${backendUrl}/signup` },
      { source: "/logout", destination: `${backendUrl}/logout` },
      { source: "/validate-session", destination: `${backendUrl}/validate-session` },
      { source: "/tasklist-sso", destination: `${backendUrl}/tasklist-sso` },
      { source: "/api/auth/tasklist-sso", destination: `${backendUrl}/api/auth/tasklist-sso` },
      { source: "/task-list-sso", destination: `${backendUrl}/task-list-sso` },
      { source: "/api/auth/task-list-sso", destination: `${backendUrl}/api/auth/task-list-sso` },

      // User management endpoints
      { source: "/users", destination: `${backendUrl}/users` },
      { source: "/users/:path*", destination: `${backendUrl}/users/:path*` },

      // Jobs endpoints
      { source: "/jobs", destination: `${backendUrl}/jobs` },
      { source: "/jobs/:path*", destination: `${backendUrl}/jobs/:path*` },
      { source: "/all-jobs", destination: `${backendUrl}/all-jobs` },

      // Procurement-compatible catalog / workflow endpoints
      { source: "/data-find/:path*", destination: `${backendUrl}/data-find/:path*` },
      { source: "/workflow/:path*", destination: `${backendUrl}/workflow/:path*` },

      // AI inference endpoints
      { source: "/predict_seg", destination: `${backendUrl}/predict_seg` },
      { source: "/predict_seg_stream", destination: `${backendUrl}/predict_seg_stream` },
      { source: "/predict_seg_roi", destination: `${backendUrl}/predict_seg_roi` },
      { source: "/predict_wall_stream", destination: `${backendUrl}/predict_wall_stream` },

      { source: "/predict_door", destination: `${backendUrl}/predict_door` },
      { source: "/predict_door_roi", destination: `${backendUrl}/predict_door_roi` },
      { source: "/predict_roof", destination: `${backendUrl}/predict_roof` },
      { source: "/predict_text", destination: `${backendUrl}/predict_text` },
      { source: "/predict-room", destination: `${backendUrl}/predict-room` },
      { source: "/predict-room-6class", destination: `${backendUrl}/predict-room-6class` },
      { source: "/predict_template", destination: `${backendUrl}/predict_template` },
      { source: "/pdf/:path*", destination: `${backendUrl}/pdf/:path*` },

      // OCR & classification endpoints
      { source: "/ocr-corrections", destination: `${backendUrl}/ocr-corrections` },
      { source: "/classify-room", destination: `${backendUrl}/classify-room` },
      { source: "/roi-heatmap", destination: `${backendUrl}/roi-heatmap` },

      // Upload & training endpoints
      { source: "/upload-image", destination: `${backendUrl}/upload-image` },
      { source: "/save-label", destination: `${backendUrl}/save-label` },
    ];
  },

  // Prevent proxy socket hang-ups on long-running AI inference requests
  httpAgentOptions: {
    keepAlive: true,
  },

  // Luna reviews wall candidates in several sequential batches. Real floor plans can
  // take more than five minutes, so keep the rewrite alive long enough for the
  // backend to return instead of converting a successful late response into a 500.
  experimental: {
    proxyTimeout,
    proxyClientMaxBodySize: proxyMaxBodySize,
    serverActions: {
      bodySizeLimit: proxyMaxBodySize,
    },
  },

  // Turbopack configuration (Next.js 16+ uses Turbopack by default)
  turbopack: {
    root: ".",
    resolveAlias: {
      // PDF.js canvas polyfill — not needed client-side
      canvas: { browser: "./empty-module.js" },
    },
  },

  // Dev server configuration
  devIndicators: false
};


export default nextConfig;
