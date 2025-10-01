import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

// Test fixtures
const nestedComponentsInput = `function Card() {
  return (
    <div className="card">
      <CardHeader title="Card Title" />
      <div className="content">
        <p>Card content goes here</p>
        <Button>Action</Button>
      </div>
    </div>
  );
}`;

describe("Nested Component Scenarios", () => {
  test("should handle nested components with proper ownership", () => {
    const output = transform(nestedComponentsInput, "src/Card.js");

    const rootDivAttrs = getAttributes(output, "div");
    expect(rootDivAttrs["data-component-file"]).toBe("src/Card.js");
    expect(rootDivAttrs["data-component-name"]).toBe("Card");

    // HTML elements should have data-rendered-by pointing to file
    const filename = "src/Card.js";
    expect(output).toContain(`data-rendered-by="${filename}"`);

    // React components should not have data-rendered-by
    expect(output).not.toContain("<CardHeader data-rendered-by");
    expect(output).not.toContain("<Button data-rendered-by");

    // Text in p tag should be wrapped
    expect(output).toContain("Card content goes here");
    expect(output).toContain(`<span data-rendered-by="${filename}"`);
  });
});
