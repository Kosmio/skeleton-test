import { defineConfig } from 'astro/config';
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://your-domain.com",
  integrations: [react(), sitemap()],
  output: "server",
  adapter: node({
    mode: "standalone"
  }),
  server: {
    port: 4321
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
