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
    const componentId = rootDivAttrs["data-editor-id"];

    // HTML elements should have data-rendered-by pointing to Card
    expect(output).toContain(`data-rendered-by="${componentId}"`);

    // React components should not have data-rendered-by
    expect(output).not.toContain("<CardHeader data-rendered-by");
    expect(output).not.toContain("<Button data-rendered-by");

    // Text in p tag should be wrapped
    expect(output).toContain("Card content goes here");
    expect(output).toContain("<span style={{");
  });
});