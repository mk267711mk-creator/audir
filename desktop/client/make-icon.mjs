import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// SVG icon — headphones with sound wave, gradient bg
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a8a"/>
      <stop offset="100%" style="stop-color:#3b82f6"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#60a5fa;stop-opacity:0.3"/>
      <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" rx="230" fill="url(#bg)"/>

  <!-- Glow circle -->
  <circle cx="512" cy="480" r="320" fill="url(#glow)"/>

  <!-- Sound waves (left) -->
  <path d="M 260 380 Q 220 480 260 580" stroke="#93c5fd" stroke-width="36" fill="none" stroke-linecap="round" opacity="0.6"/>
  <path d="M 200 320 Q 140 480 200 640" stroke="#60a5fa" stroke-width="28" fill="none" stroke-linecap="round" opacity="0.35"/>

  <!-- Sound waves (right) -->
  <path d="M 764 380 Q 804 480 764 580" stroke="#93c5fd" stroke-width="36" fill="none" stroke-linecap="round" opacity="0.6"/>
  <path d="M 824 320 Q 884 480 824 640" stroke="#60a5fa" stroke-width="28" fill="none" stroke-linecap="round" opacity="0.35"/>

  <!-- Headphone arc -->
  <path d="M 310 480 Q 310 270 512 270 Q 714 270 714 480"
        stroke="white" stroke-width="56" fill="none" stroke-linecap="round"/>

  <!-- Left ear cup -->
  <rect x="258" y="460" width="96" height="148" rx="40" fill="white"/>
  <rect x="274" y="476" width="64" height="116" rx="28" fill="#3b82f6"/>

  <!-- Right ear cup -->
  <rect x="670" y="460" width="96" height="148" rx="40" fill="white"/>
  <rect x="686" y="476" width="64" height="116" rx="28" fill="#3b82f6"/>

  <!-- App name -->
  <text x="512" y="790" font-family="Arial, sans-serif" font-size="120" font-weight="900"
        fill="white" text-anchor="middle" letter-spacing="8" opacity="0.95">AUDIR</text>
</svg>`;

const SIZES = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const BASE = 'android/app/src/main/res';

for (const { dir, size } of SIZES) {
  const outDir = path.join(BASE, dir);
  fs.mkdirSync(outDir, { recursive: true });

  await sharp(Buffer.from(SVG))
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, 'ic_launcher.png'));

  await sharp(Buffer.from(SVG))
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, 'ic_launcher_round.png'));

  console.log(`✓ ${dir} — ${size}x${size}`);
}

// Also save 1024px version
await sharp(Buffer.from(SVG)).resize(1024, 1024).png().toFile('icon.png');
console.log('✓ icon.png (1024x1024)');
console.log('Done!');
