import { describe, test, expect } from "vitest";
import { transformSync } from "@babel/core";
import { attachBridge } from "../src/index";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Helper function to transform code with the bridge plugin
function transformBridge(
  code: string,
  filename = "test.js",
  options: any = {},
) {
  const pluginOptions = { ...options, filename };
  
  const result = transformSync(code, {
    plugins: [[attachBridge, pluginOptions]],
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

describe("AttachBridge Plugin", () => {
  test("should wrap elements with data-editor-id in BridgeWrapper", () => {
    const input = `function Button() {
  return <button data-editor-id="btn-123">Click me</button>;
}`;

    const output = transformBridge(input, "button-wrap.js");
    
    expect(output).toContain("BridgeWrapper");
    expect(output).toContain('editorId="btn-123"');
    expect(output).toContain('originalElement={"button"}');
    expect(output).toContain('<button data-editor-id="btn-123">Click me</button>');
  });

  test("should add React import when none exists", () => {
    const input = `function Button() {
  return <button data-editor-id="btn-123">Click me</button>;
}`;

    const output = transformBridge(input, "no-react-import.js");
    
    expect(output).toContain('import React from "react"');
    expect(output).toContain("function BridgeWrapper");
  });

  test("should not add React import when already exists", () => {
    const input = `import React from "react";

function Button() {
  return <button data-editor-id="btn-123">Click me</button>;
}`;

    const output = transformBridge(input, "existing-react-import.js");
    
    // Should not have duplicate React imports
    const reactImportCount = (output.match(/import.*from "react"/g) || []).length;
    expect(reactImportCount).toBe(1);
    expect(output).toContain("function BridgeWrapper");
  });

  test("should handle multiple elements with data-editor-id", () => {
    const input = `function Card() {
  return (
    <div data-editor-id="card-1">
      <h1 data-editor-id="title-1">Title</h1>
      <p data-editor-id="text-1">Content</p>
    </div>
  );
}`;

    const output = transformBridge(input, "multiple-elements.js");
    
    expect(output).toContain('editorId="card-1"');
    expect(output).toContain('editorId="title-1"');
    expect(output).toContain('editorId="text-1"');
    expect((output.match(/BridgeWrapper/g) || []).length).toBeGreaterThan(3); // Should have multiple instances
  });

  test("should not wrap React components, only HTML elements", () => {
    const input = `function App() {
  return (
    <div>
      <MyComponent data-editor-id="comp-1" />
      <button data-editor-id="btn-1">Click</button>
    </div>
  );
}`;

    const output = transformBridge(input, "react-vs-html.js");
    
    // Should wrap the button but not MyComponent
    expect(output).toContain('editorId="btn-1"');
    expect(output).not.toContain('editorId="comp-1"');
    expect(output).toContain('<MyComponent data-editor-id="comp-1" />');
  });

  test("should not wrap already wrapped elements", () => {
    const input = `function Button() {
  return (
    <BridgeWrapper editorId="existing">
      <button data-editor-id="btn-1">Click</button>
    </BridgeWrapper>
  );
}`;

    const output = transformBridge(input, "already-wrapped.js");
    
    // Should not double-wrap
    expect(output).not.toContain('editorId="btn-1"');
    expect(output).toContain('<BridgeWrapper editorId="existing">');
  });

  test("should skip files in skipFiles option", () => {
    const input = `function Button() {
  return <button data-editor-id="btn-123">Click me</button>;
}`;

    const output = transformBridge(input, "skipped-file.js", {
      skipFiles: ["skipped-file.js"]
    });
    
    // Should not transform when file is in skipFiles
    expect(output).not.toContain("BridgeWrapper");
    expect(output).toContain('<button data-editor-id="btn-123">Click me</button>');
  });

  test("should handle elements without data-editor-id", () => {
    const input = `function Button() {
  return (
    <div>
      <button>No ID</button>
      <span data-editor-id="span-1">Has ID</span>
    </div>
  );
}`;

    const output = transformBridge(input, "mixed-elements.js");
    
    // Should only wrap elements with data-editor-id
    expect(output).toContain('editorId="span-1"');
    expect(output).toContain('<button>No ID</button>'); // Unchanged
  });

  test("should preserve data-editor-id in wrapped elements", () => {
    const input = `function Button() {
  return <button data-editor-id="btn-123" className="btn">Click me</button>;
}`;

    const output = transformBridge(input, "preserve-editor-id.js");
    
    // The inner button should preserve data-editor-id
    expect(output).toContain('<button data-editor-id="btn-123" className="btn">Click me</button>');
    expect(output).toContain('editorId="btn-123"'); // And BridgeWrapper should have it too
  });

  test("should always add BridgeWrapper function to all files", () => {
    const input = `function Button() {
  return <button>No editor ID</button>;
}`;

    const output = transformBridge(input, "always-add-wrapper.js");
    
    // Should always add BridgeWrapper even when no elements need wrapping
    expect(output).toContain("function BridgeWrapper");
    expect(output).toContain("import React");
    // But the button itself should not be wrapped since it has no data-editor-id
    expect(output).toContain('<button>No editor ID</button>');
  });
});