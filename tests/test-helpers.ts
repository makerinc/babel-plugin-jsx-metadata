import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { transformSync } from "@babel/core";
import plugin, { type options } from "../src/index";

// Helper function to transform code with the plugin
export function transform(
  code: string,
  filename = "test.js",
  options: options = {},
) {
  const result = transformSync(code, {
    plugins: [[plugin, { ...options, filename }]],
    parserOpts: {
      plugins: ["jsx", "typescript"],
    },
  });

  const transformedCode = result?.code || "";

  // Debug: dump transformed code to outputs directory
  try {
    // Get the test file name from the call stack
    const error = new Error();
    const stack = error.stack || "";
    const match = stack.match(/at.*[\/\\]([^\/\\]+)\.test\./);
    const specName = match ? match[1] : "unknown";

    const outputDir = join(__dirname, "outputs", specName);
    const outputFilename =
      filename.replace(/[\/\\]/g, "_").replace(/\.(js|jsx|ts|tsx)$/, "") +
      "_output.js";
    const outputPath = join(outputDir, outputFilename);

    // Ensure directory exists
    const { mkdirSync } = require("fs");
    mkdirSync(outputDir, { recursive: true });

    writeFileSync(
      outputPath,
      `// Original file: ${filename}\n// Input:\n/*\n${code}\n*/\n\n// Transformed output:\n${transformedCode}`,
    );
  } catch (_) {
    // Ignore file write errors in tests
  }

  return transformedCode;
}

// Helper to extract attributes from transformed JSX
export function getAttributes(
  transformedCode: string,
  elementName: string,
): Record<string, string> {
  const regex = new RegExp(`<${elementName}([^>]*)>`, "g");
  const match = regex.exec(transformedCode);
  if (!match) return {};

  const attributesStr = match[1];
  const attributes: Record<string, string> = {};

  // Extract data-* attributes
  const attrRegex = /(data-[\w-]+)="([^"]*)"/g;
  let attrMatch: RegExpExecArray | null = null;
  // biome-ignore lint/suspicious/noAssignInExpressions::
  while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
    attributes[attrMatch[1]] = attrMatch[2];
  }

  return attributes;
}
