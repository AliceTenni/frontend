import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

/**
 * Backend route groups (see SynapsVault/backend src/routes).
 *
 * The dev server forwards these to the backend, which is responsible for
 * injecting/validating the API key. The key is NOT read from Vite env vars
 * (no VITE_API_KEY) — it never belongs in client-side configuration.
 */
const API_PROXY_PATTERN = "^/(resources|agent|registry|publishers|buyers|payments)(/|\\?|$)";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_URL ?? "";
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || "http://localhost:3000";

  // Generate catalog URL pattern for service worker caching
  // Matches API origin to ensure cache only works for configured backend
  let catalogUrlPattern: RegExp;
  try {
    if (apiBase) {
      const apiOrigin = new URL(apiBase).origin;
      catalogUrlPattern = new RegExp(
        `^${apiOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/resources`,
      );
    } else {
      catalogUrlPattern = /^\/resources/;
    }
  } catch {
    catalogUrlPattern = /^\/resources/;
  }

  return {
    // Build configuration
    build: {
      // Target modern browsers (ES2020+)
      target: "ES2020",
      // Warn if chunks exceed 800KB (gzipped)
      chunkSizeWarningLimit: 800,
      // Generate source maps for production debugging
      sourcemap: true,
      // Optimize for production
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: true, // Remove console logs in production
        },
      },
      // Split vendor libraries into separate, cache-friendly chunks
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return undefined;
            }
            // `scheduler` must live with react-dom: leaving it in the generic
            // "vendor" chunk creates a vendor <-> react-vendor import cycle
            // that crashes the app on load ("Cannot set properties of undefined").
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return "react-vendor";
            }
            if (/[\\/]node_modules[\\/](@stellar|@x402)[\\/]/.test(id)) {
              return "stellar-vendor";
            }
            if (/[\\/]node_modules[\\/]@sentry[\\/]/.test(id)) {
              return "sentry-vendor";
            }
            if (/[\\/]node_modules[\\/](i18next|react-i18next)[\\/]/.test(id)) {
              return "i18n-vendor";
            }
            return "vendor";
          },
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
        },
      },
    },

    // Vite plugins
    plugins: [
      // React with Fast Refresh
      react(),

      // Bundle analysis tool
      visualizer({
        filename: "stats.html",
        brotliSize: true,
        gzipSize: true,
      }),

      // Progressive Web App support
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.svg"],
        manifest: {
          name: "SynapsVault",
          short_name: "SynapsVault",
          description:
            "Payment-protected vault for digital resources on Stellar using HTTP 402 and x402.",
          theme_color: "#7654fa",
          background_color: "#0d0e16",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: "index.html",
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            // Cache catalog API responses
            {
              urlPattern: catalogUrlPattern,
              handler: "NetworkFirst",
              options: {
                cacheName: "synapsvault-catalog",
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 32,
                  maxAgeSeconds: 60 * 60 * 24, // 24 hours
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],

    // Development server configuration
    server: {
      port: 5173,
      strictPort: false, // Fall back to next available port
      // With VITE_API_URL unset the app calls same-origin paths; forward every
      // backend route group so none of them fall through to index.html.
      // The proxy/backend injects the API key; Vite env vars carry no secret.
      proxy: {
        [API_PROXY_PATTERN]: {
          target: devProxyTarget,
          changeOrigin: true,
          configure: (proxy) => {
            // Backend down: answer with JSON the app can explain, instead of
            // Vite's bare "500 Internal Server Error".
            proxy.on("error", (err, _req, res) => {
              if (!("writeHead" in res) || res.headersSent) return;
              res.writeHead(502, { "Content-Type": "application/json" });
              const reason = (err as NodeJS.ErrnoException).code || err.message || "connection failed";
              res.end(JSON.stringify({ error: `Backend unreachable at ${devProxyTarget} (${reason})` }));
            });
          },
        },
      },
    },
  };
});