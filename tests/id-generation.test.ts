import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

// Test fixtures
const filenameTestInput = `const Component = () => <div>Test</div>;`;

describe("ID Generation", () => {
  test("should generate snake_case IDs from filenames", () => {
    const testCases = [
      { filename: "src/Button.js", expectedPrefix: "button_" },
      {
        filename: "src/components/UserCard.tsx",
        expectedPrefix: "usercard_",
      },
      { filename: "src/pages/contact-us.jsx", expectedPrefix: "contact_us_" },
      {
        filename: "src/utils/data.helpers.js",
        expectedPrefix: "data_helpers_",
      },
    ];

    testCases.forEach(({ filename, expectedPrefix }) => {
      const output = transform(filenameTestInput, filename);
      const divAttrs = getAttributes(output, "div");

      expect(divAttrs["data-editor-id"]).toMatch(
        new RegExp(`^${expectedPrefix}`),
      );
    });
  });
});