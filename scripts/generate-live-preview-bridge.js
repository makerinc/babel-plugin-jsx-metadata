#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildSync } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateMinifiedLivePreviewBridge() {
  try {
    console.log("Generating LivePreviewBridgeSource...");

    const bridgeSrcPath = path.join(__dirname, "../src/LivePreviewBridge.tsx");
    const indexJsPath = path.join(__dirname, "../dist/index.js");

    // Bundle and minify using esbuild
    console.log("Bundling and minifying with esbuild...");

    const result = buildSync({
      entryPoints: [bridgeSrcPath],
      bundle: true,
      minify: true,
      platform: "browser",
      target: ["es2018"],
      format: "esm",
      external: ["react", "react-dom"],
      write: false,
    });

    if (!result.outputFiles?.length) {
      throw new Error("esbuild produced no output.");
    }

    const minifiedCode = result.outputFiles[0].text;

    // Update dist/index.js with embedded source
    let indexContent = fs.readFileSync(indexJsPath, "utf8");
    indexContent = indexContent.replace(
      'exports.LivePreviewBridgeSource = "";',
      `exports.LivePreviewBridgeSource = ${JSON.stringify(minifiedCode)};`,
    );

    fs.writeFileSync(indexJsPath, indexContent);

    const originalSize = fs.statSync(bridgeSrcPath).size;
    const minifiedSize = Buffer.byteLength(minifiedCode, "utf8");

    console.log(
      `✅ LivePreviewBridgeSource updated successfully in ${indexJsPath}`,
    );
    console.log(`📦 Original size: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`📦 Minified size: ${(minifiedSize / 1024).toFixed(2)} KB`);
    console.log(
      `📦 Compression: ${((1 - minifiedSize / originalSize) * 100).toFixed(1)}%`,
    );
  } catch (error) {
    console.error("❌ Failed to generate LivePreviewBridge.js:", error.message);
    process.exit(1);
  }
}

generateMinifiedLivePreviewBridge();
