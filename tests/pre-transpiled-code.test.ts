import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

// Test fixtures
const reactCreateElementInput = `function Button() {
  return React.createElement("button", { 
    className: "btn" 
  }, "Click me");
}`;

describe("Pre-transpiled Code", () => {
  test("should handle React.createElement syntax", () => {
    const output = transform(reactCreateElementInput, "src/Button.js");

    // Should add component metadata to button element
    const buttonAttrs = getAttributes(output, "button");
    expect(buttonAttrs["data-component-file"]).toBe("src/Button.js");
    expect(buttonAttrs["data-component-name"]).toBe("Button");

    // Should wrap text content
    expect(output).toContain("<span style={{");
    expect(output).toContain("data-rendered-by");
  });
});