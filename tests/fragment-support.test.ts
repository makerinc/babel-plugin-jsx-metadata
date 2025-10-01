import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

// Test fixtures
const jsxFragmentInput = `function List() {
  return (
    <>
      <h2>Items</h2>
      <ul>
        <li>Item 1</li>
        <li>Item 2</li>
      </ul>
    </>
  );
}`;

describe("Fragment Support", () => {
  test("should handle JSX fragments", () => {
    const output = transform(jsxFragmentInput, "src/List.js");

    // Fragment children should be treated as roots
    const h2Attrs = getAttributes(output, "h2");
    const ulAttrs = getAttributes(output, "ul");

    expect(h2Attrs["data-file"]).toBe("src/List.js");
    expect(ulAttrs["data-file"]).toBe("src/List.js");
    expect(h2Attrs["data-editor-id"]).toMatch(/^list_/);
    expect(ulAttrs["data-editor-id"]).toMatch(/^list_/);
  });
});