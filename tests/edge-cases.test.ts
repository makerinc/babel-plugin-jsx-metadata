import { describe, test, expect } from "vitest";
import { transformSync } from "@babel/core";
import { transform } from "./test-helpers";
import babelPluginDomEditor from "../src/index";

// Test fixtures
const imageOptimizerInput = `function ImageOptimizer() {
  return <div>Optimizer</div>;
}`;

const basicFunctionInput = `function Button() {
  return <button>Click me</button>;
}`;

const existingDataFileInput = `function Existing() {
  return <div data-component-file="existing.js">Content</div>;
}`;

describe("Edge Cases", () => {
  test("should skip ImageOptimizer files by default", () => {
    const output = transform(imageOptimizerInput, "ImageOptimizer.jsx");

    // Should not add any data attributes
    expect(output).not.toContain("data-component-file");
    expect(output).not.toContain("data-editor-id");
    expect(output).not.toContain("data-rendered-by");
  });

  test("should support custom skipFiles option", () => {
    const result = transformSync(basicFunctionInput, {
      plugins: [
        [
          babelPluginDomEditor,
          { filename: "src/MyComponent.js", skipFiles: ["MyComponent.js"] },
        ],
      ],
      parserOpts: {
        plugins: ["jsx", "typescript"],
      },
    });
    const output = result?.code || "";

    // Should not add any data attributes
    expect(output).not.toContain("data-component-file");
    expect(output).not.toContain("data-editor-id");
    expect(output).not.toContain("data-rendered-by");
  });

  test("should not modify elements that already have data-component-file", () => {
    const output = transform(existingDataFileInput, "src/New.js");

    // Should keep existing data-component-file and not add new attributes
    expect(output).toContain('data-component-file="existing.js"');
    expect(output).not.toContain('data-component-file="src/New.js"');
    expect(output).not.toContain("data-editor-id");
  });
});