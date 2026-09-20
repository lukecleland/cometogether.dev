import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const root = new URL('../public/', import.meta.url);
const mark = readFileSync(new URL('brand-mark.svg', root), 'utf8');
const content = mark.slice(mark.indexOf('>') + 1, mark.lastIndexOf('</svg>'));
const icon = (inset, background = '#101014') => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="${background}"/><g transform="translate(${inset} ${inset}) scale(${(512 - inset * 2) / 100})">${content}</g></svg>\n`;
const sources = { 'favicon.svg': icon(32), 'icon.svg': icon(64), 'icon-maskable.svg': icon(112) };
for (const [name, svg] of Object.entries(sources)) writeFileSync(new URL(name, root), svg);
const render = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
for (const [name, size, source] of [
  ['favicon-16x16.png', 16, 'favicon.svg'], ['favicon-32x32.png', 32, 'favicon.svg'],
  ['apple-touch-icon.png', 180, 'icon.svg'], ['icon-192.png', 192, 'icon.svg'],
  ['icon-512.png', 512, 'icon.svg'], ['icon-maskable-512.png', 512, 'icon-maskable.svg'],
]) writeFileSync(new URL(name, root), render(sources[source], size));
// PNG-backed ICO with three native resolutions for legacy browser support.
const sizes = [16, 32, 48];
const images = sizes.map(size => render(sources['favicon.svg'], size));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((png, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index]; header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
writeFileSync(new URL('favicon.ico', root), Buffer.concat([header, ...images]));
console.log('Generated SVG, PNG, Apple, maskable and ICO icons from brand-mark.svg.');
