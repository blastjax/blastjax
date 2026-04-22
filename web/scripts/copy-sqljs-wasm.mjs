/**
 * Copy sql.js WASM into ``public/sqljs`` so static / GitHub Pages hosts can load it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "node_modules", "sql.js", "dist");
const destDir = path.join(root, "public", "sqljs");
const files = ["sql-wasm.wasm"];

if (!fs.existsSync(srcDir)) {
  console.warn("copy-sqljs-wasm: sql.js not installed yet; skip");
  process.exit(0);
}
fs.mkdirSync(destDir, { recursive: true });
for (const f of files) {
  const from = path.join(srcDir, f);
  if (!fs.existsSync(from)) {
    console.warn(`copy-sqljs-wasm: missing ${from}; skip`);
    continue;
  }
  fs.copyFileSync(from, path.join(destDir, f));
}
