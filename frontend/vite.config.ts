import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "sql-wasm-browser.wasm", "sql-wasm.wasm"],
      manifest: {
        name: "Rumi - Music Session Analyzer",
        short_name: "Rumi",
        description: "Analyze music sessions, track BPM, and manage your DJ sets",
        theme_color: "#0c0c0c",
        background_color: "#0c0c0c",
        display: "standalone",
        orientation: "portrait-primary",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/analyze\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "analyze-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],

  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/storage": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
      "/analyze": {
        target: "http://localhost:8000",
        bypass(req) {
          if (req.headers.accept?.includes("text/html")) return "/index.html";
        },
      },
    },
  },
});

// Made with Bob
