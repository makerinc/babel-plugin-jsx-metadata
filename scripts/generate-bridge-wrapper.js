#!/usr/bin/env node

const { generateBridgeWrapperFile } = require("../dist/index.js");
const { minify } = require("terser");
const fs = require("fs");
const path = require("path");

async function generateMinifiedBridgeWrapper() {
  try {
    console.log("Generating BridgeWrapper.js...");

    const bridgeWrapperCode = generateBridgeWrapperFile();
    const outputPath = path.join(__dirname, "../src/generatedBridgeWrapper.js");

    console.log("Minifying code...");

    // First, transform JSX to regular JS calls
    const { transformSync } = require("@babel/core");
    const transformedCode = transformSync(bridgeWrapperCode, {
      presets: [["@babel/preset-react", { runtime: "automatic" }]],
      compact: false,
    });

    if (!transformedCode || !transformedCode.code) {
      throw new Error("Failed to transform JSX");
    }

    // Then minify the transformed code
    const minified = await minify(transformedCode.code, {
      compress: {
        drop_console: false, // Keep console.log for debugging
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        reserved: ["BridgeWrapper", "React"], // Keep important names
      },
      format: {
        comments: false,
        beautify: false,
      },
    });

    if (minified.error) {
      throw minified.error;
    }

    const minifiedCode = minified.code;

    // Wrap in module.exports format
    const moduleCode = `module.exports = ${JSON.stringify(minifiedCode)};`;

    fs.writeFileSync(outputPath, moduleCode);

    // Also copy to dist directory for runtime access
    const distPath = path.join(__dirname, "../dist/generatedBridgeWrapper.js");
    fs.writeFileSync(distPath, moduleCode);

    console.log(`✅ BridgeWrapper.js generated successfully at ${outputPath}`);
    console.log(
      `📦 Original size: ${(bridgeWrapperCode.length / 1024).toFixed(2)} KB`,
    );
    console.log(
      `📦 Minified size: ${(minifiedCode.length / 1024).toFixed(2)} KB`,
    );
    console.log(`📦 Module size: ${(moduleCode.length / 1024).toFixed(2)} KB`);
    console.log(
      `📦 Compression: ${((1 - minifiedCode.length / bridgeWrapperCode.length) * 100).toFixed(1)}%`,
    );
  } catch (error) {
    console.error("❌ Failed to generate BridgeWrapper.js:", error.message);
    process.exit(1);
  }
}

generateMinifiedBridgeWrapper();
