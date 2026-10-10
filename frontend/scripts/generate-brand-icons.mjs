import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

// Run from frontend: node scripts/generate-brand-icons.mjs
const mark = await readFile("public/brand/stock-simulator-mark.svg", "utf8");
const inner = mark.replace(/<svg[^>]*>/, "").replace("</svg>", "");
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#080e1a"/><g transform="translate(76 76) scale(2.8125)">${inner}</g></svg>`;
await mkdir("public/icons", { recursive: true });
await writeFile("public/favicon.svg", icon);
await writeFile("public/icons/icon.svg", icon);
for (const [path, size] of [["public/icons/icon-192.png", 192], ["public/icons/icon-512.png", 512], ["public/icons/apple-touch-icon.png", 180], ["public/apple-touch-icon.png", 180]]) {
  await sharp(Buffer.from(icon)).resize(size, size).png().toFile(path);
}
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#080e1a"/><g transform="translate(112 112) scale(2.25)">${inner}</g></svg>`;
await sharp(Buffer.from(maskable)).png().toFile("public/icons/icon-maskable-512.png");
const png = await sharp(Buffer.from(icon)).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header[6] = 32; header[7] = 32;
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
await writeFile("src/app/favicon.ico", Buffer.concat([header, png]));
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#080e1a"/><g transform="translate(78 150) scale(2.1)">${inner}</g><g fill="#f8fafc" font-family="sans-serif"><text x="388" y="283" font-size="48" font-weight="bold">STOCK SIMULATOR</text><text x="388" y="339" font-size="26" fill="#a5dcec">Practice Indian markets.</text><text x="388" y="380" font-size="26" fill="#a5dcec">Trade with virtual money.</text><text x="80" y="538" font-size="22" fill="#94a3b8">NSE Stocks · NFO Futures &amp; Options · Paper Trading</text></g></svg>`;
await sharp(Buffer.from(social)).png().toFile("public/brand/social-preview.png");
