import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

// Test fixtures
const filenameTestInput = (name) => `const ${name} = () => <div>Test</div>;`;

describe("ID Generation", () => {
  test("should generate snake_case IDs from filenames", () => {
    const testCases = [
      { name: "Button", filename: "src/Button.js", expectedPrefix: "button_" },
      {
        name: "UserCard",
        filename: "src/components/UserCard.tsx",
        expectedPrefix: "usercard_",
      },
      {
        name: "ContactUs",
        filename: "src/pages/contact-us.jsx",
        expectedPrefix: "contactus_",
      },
      {
        name: "DataHelpers",
        filename: "src/utils/data.helpers.js",
        expectedPrefix: "datahelpers_",
      },
    ];

    testCases.forEach(({ name, filename, expectedPrefix }) => {
      const output = transform(filenameTestInput(name), filename);
      const divAttrs = getAttributes(output, "div");

      expect(divAttrs["data-editor-id"]).toMatch(
        new RegExp(`^${expectedPrefix}`),
      );
    });
  });
});
