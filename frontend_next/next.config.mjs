/** @type {import('next').NextConfig} */
const nextConfig = {
  // CAD/BIM client-side application — all rendering is client-side
  allowedDevOrigins: ['14.241.197.188'],
  // API Rewrites — proxy all backend endpoints to Python backend on :8090
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8090";

    return [
      // Main API routes
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },

      // Auth endpoints
      { source: "/login", destination: `${backendUrl}/login` },
      { source: "/signup", destination: `${backendUrl}/signup` },
      { source: "/logout", destination: `${backendUrl}/logout` },
      { source: "/validate-session", destination: `${backendUrl}/validate-session` },

      // User management endpoints
      { source: "/users", destination: `${backendUrl}/users` },
      { source: "/users/:path*", destination: `${backendUrl}/users/:path*` },

      // Jobs endpoints
      { source: "/jobs", destination: `${backendUrl}/jobs` },
      { source: "/jobs/:path*", destination: `${backendUrl}/jobs/:path*` },
      { source: "/all-jobs", destination: `${backendUrl}/all-jobs` },

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

  // Increase proxy timeout for rewrites to 5 minutes (300s)
  // Default is ~60-120s which is too short for first-run AI model loading + inference
  experimental: {
    proxyTimeout: 300_000,
  },

  // Turbopack configuration (Next.js 16+ uses Turbopack by default)
  turbopack: {
    root: ".",
    resolveAlias: {
      // PDF.js canvas polyfill — not needed client-side
      canvas: { browser: "./empty-module.js" },
    },
  },

  // Prevent proxy socket hang-ups on long-running AI inference requests
  httpAgentOptions: {
    keepAlive: true,
  },

  // Increase proxy timeout for rewrites to 5 minutes (300s)
  // Default is ~60-120s which is too short for first-run AI model loading + inference
  experimental: {
    proxyTimeout: 300_000,
  },

  // Dev server configuration
  devIndicators: false
};


export default nextConfig;
