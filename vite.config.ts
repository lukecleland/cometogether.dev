import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version),
  },
  plugins: [tailwindcss(), react(), viteStaticCopy({ targets: ["cmaps", "standard_fonts", "wasm"].map(dir => ({ src: `node_modules/pdfjs-dist/${dir}/*`, dest: `pdfjs/${dir}`, rename: { stripBase: true } })) })],
});
