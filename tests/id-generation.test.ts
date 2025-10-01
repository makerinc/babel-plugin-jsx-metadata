import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

// Test fixtures
const filenameTestInput = (name) => `const ${name} = () => <div>Test</div>;`;

describe("Component Metadata Generation", () => {
  test("should use file paths and component names for metadata", () => {
    const testCases = [
      { name: "Button", filename: "src/Button.js" },
      { name: "UserCard", filename: "src/components/UserCard.tsx" },
      { name: "ContactUs", filename: "src/pages/contact-us.jsx" },
      { name: "DataHelpers", filename: "src/utils/data.helpers.js" },
    ];

    testCases.forEach(({ name, filename }) => {
      const output = transform(filenameTestInput(name), filename);
      const divAttrs = getAttributes(output, "div");

      // Should use file path and component name directly
      expect(divAttrs["data-component-file"]).toBe(filename);
      expect(divAttrs["data-component-name"]).toBe(name);
    });
  });
});
