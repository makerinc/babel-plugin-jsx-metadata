#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { transformSync } from "@babel/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateMinifiedLivePreviewBridge() {
  try {
    console.log("Generating LivePreviewBridgeSource.js...");

    // Read the LivePreviewBridge source directly
    const bridgePath = path.join(__dirname, "../dist/LivePreviewBridge.js");
    const bridgeWrapperCode = fs.readFileSync(bridgePath, "utf8");

    console.log("Compacting code...");

    // Transform JSX to regular JS calls with compact output
    const transformedCode = transformSync(bridgeWrapperCode, {
      presets: [["@babel/preset-react", { runtime: "automatic" }]],
      compact: true,
      minified: true,
    });

    if (!transformedCode || !transformedCode.code) {
      throw new Error("Failed to transform JSX");
    }

    const minifiedCode = transformedCode.code;

    // Update the compiled index.js file to include the actual minified code
    const indexJsPath = path.join(__dirname, "../dist/index.js");
    let indexContent = fs.readFileSync(indexJsPath, "utf8");

    // Replace the empty string with the actual minified code
    indexContent = indexContent.replace(
      'export const LivePreviewBridgeSource = "";',
      `export const LivePreviewBridgeSource = ${JSON.stringify(minifiedCode)};`,
    );

    fs.writeFileSync(indexJsPath, indexContent);

    console.log(
      `✅ LivePreviewBridgeSource updated successfully in ${indexJsPath}`,
    );
    console.log(
      `📦 Original size: ${(bridgeWrapperCode.length / 1024).toFixed(2)} KB`,
    );
    console.log(
      `📦 Minified size: ${(minifiedCode.length / 1024).toFixed(2)} KB`,
    );
    console.log(
      `📦 Compression: ${((1 - minifiedCode.length / bridgeWrapperCode.length) * 100).toFixed(1)}%`,
    );
  } catch (error) {
    console.error("❌ Failed to generate LivePreviewBridge.js:", error.message);
    process.exit(1);
  }
}

generateMinifiedLivePreviewBridge();
