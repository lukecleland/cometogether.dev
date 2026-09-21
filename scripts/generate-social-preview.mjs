import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const publicRoot = new URL('../public/', import.meta.url);
const mark = readFileSync(new URL('brand-mark-rounded.svg', publicRoot), 'utf8');
const tiles = mark.slice(mark.indexOf('>') + 1, mark.lastIndexOf('</svg>'));
// Outline weight keeps the variable Outfit font legible in rasterizers without axis support.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow"><stop stop-color="#7048fa" stop-opacity=".19"/><stop offset="1" stop-color="#7048fa" stop-opacity="0"/></radialGradient>
    <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#ffffff" opacity=".08"/></pattern>
  </defs>
  <rect width="1200" height="630" fill="#101014"/>
  <rect width="1200" height="630" fill="url(#dots)"/>
  <ellipse cx="930" cy="190" rx="490" ry="430" fill="url(#glow)"/>
  <rect x="56" y="56" width="1088" height="518" rx="28" fill="none" stroke="#ffffff" stroke-opacity=".1"/>
  <g transform="translate(104 214) scale(1.12)">${tiles}</g>
  <g font-family="Outfit, sans-serif">
    <text x="246" y="301" font-size="100" font-weight="600" letter-spacing="-3" fill="#fafafa" stroke="#fafafa" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke">maketogether</text>
    <text x="250" y="367" font-size="34" font-weight="400" fill="#d4acfa" stroke="#d4acfa" stroke-width="0.7" paint-order="stroke">Good things happen together.</text>
    <text x="104" y="508" font-size="25" fill="#b9b9c5" stroke="#b9b9c5" stroke-width="0.6" paint-order="stroke">Video chat. Shared canvas. Music. Ideas.</text>
    <text x="1096" y="508" text-anchor="end" font-size="22" fill="#b9b9c5" stroke="#b9b9c5" stroke-width="0.6" paint-order="stroke">No account needed.</text>
  </g>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL('fonts/outfit-latin.ttf', publicRoot))], loadSystemFonts: false, defaultFontFamily: 'Outfit' } }).render().asPng();
writeFileSync(new URL('social-preview-v1.png', publicRoot), png);
console.log(`Generated social-preview-v1.png (1200 × 630, ${png.length} bytes).`);
