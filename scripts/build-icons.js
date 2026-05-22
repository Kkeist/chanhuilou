// ============================================================
// 把 public/ 下的 SVG 渲染成 PNG 多尺寸 (apple-touch / icon-192 / icon-512 / maskable / og-image)
// 跑: node scripts/build-icons.js
// 依赖: sharp (dev dep, 只在本地构建 icon 时用)
// ============================================================

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');

// 单字 favicon 渲染目标
const FAVICON_TARGETS = [
  { src: 'favicon.svg',  out: 'apple-touch-icon.png', size: 180 },
  { src: 'favicon.svg',  out: 'icon-192.png',         size: 192 },
  { src: 'favicon.svg',  out: 'icon-512.png',         size: 512 },
  { src: 'maskable.svg', out: 'maskable-512.png',     size: 512 },
];

async function renderSquare({ src, out, size }) {
  const svg = fs.readFileSync(path.join(PUBLIC, src));
  // density 控制 SVG 栅格化 DPI: 默认 viewBox 是 64x64, 目标 size 像素
  // density = 72 * (size / viewBoxSize) 让矢量不失真
  const density = Math.max(72, Math.ceil(72 * size / 64));
  await sharp(svg, { density })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(PUBLIC, out));
  console.log(`OK ${out} (${size}x${size})`);
}

async function renderOg() {
  const svg = fs.readFileSync(path.join(PUBLIC, 'og-image.svg'));
  // og-image 是 1200x630 viewBox, 直接渲染原尺寸
  await sharp(svg, { density: 96 })
    .resize(1200, 630)
    .png()
    .toFile(path.join(PUBLIC, 'og-image.png'));
  console.log('OK og-image.png (1200x630)');
}

(async () => {
  for (const t of FAVICON_TARGETS) {
    await renderSquare(t);
  }
  await renderOg();
  console.log('done.');
})().catch((e) => {
  console.error('build-icons failed:', e);
  process.exit(1);
});
