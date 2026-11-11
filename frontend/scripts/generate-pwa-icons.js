/**
 * PWA Icon Generator
 *
 * Generates all required PWA icons from the source logo.
 * Run with: node scripts/generate-pwa-icons.js
 *
 * Requires: sharp (install with `pnpm add -D sharp`)
 *
 * Or generate manually using any image editor / online tool:
 *   - icon-192.png   → 192×192 from logo.png
 *   - icon-512.png   → 512×512 from logo.png
 *   - maskable-512.png → 512×512 with ~20% padding (safe zone)
 *   - apple-touch-icon.png → 180×180 from logo.png
 *   - shortcut-pos.png → 96×96 POS icon
 *   - shortcut-stock.png → 96×96 inventory icon
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const SOURCE = path.join(__dirname, "..", "public", "logo.png");
const ICONS_DIR = path.join(__dirname, "..", "public", "icons");

async function main() {
  // Create icons directory
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  console.log("🎨 Generating PWA icons from logo.png ...\n");

  // Standard icons (tight crop)
  const sizes = [
    { name: "icon-192.png", size: 192 },
    { name: "icon-512.png", size: 512 },
    { name: "apple-touch-icon.png", size: 180 },
  ];

  for (const { name, size } of sizes) {
    await sharp(SOURCE)
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(ICONS_DIR, name));
    console.log(`  ✅ ${name} (${size}×${size})`);
  }

  // Maskable icon — add 20% padding so the icon stays in the safe zone
  const maskableSize = 512;
  const innerSize = Math.round(maskableSize * 0.8); // 80% of canvas
  const padding = Math.round((maskableSize - innerSize) / 2);

  const resizedLogo = await sharp(SOURCE)
    .resize(innerSize, innerSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: maskableSize,
      height: maskableSize,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite([{ input: resizedLogo, top: padding, left: padding }])
    .png()
    .toFile(path.join(ICONS_DIR, "maskable-512.png"));
  console.log(`  ✅ maskable-512.png (${maskableSize}×${maskableSize}, 20% padding)`);

  // Shortcut icons — reuse the logo at 96×96
  const shortcutSizes = [
    { name: "shortcut-pos.png", size: 96 },
    { name: "shortcut-stock.png", size: 96 },
  ];

  for (const { name, size } of shortcutSizes) {
    await sharp(SOURCE)
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(ICONS_DIR, name));
    console.log(`  ✅ ${name} (${size}×${size})`);
  }

  console.log("\n🎉 All PWA icons generated in public/icons/");
}

main().catch(console.error);
