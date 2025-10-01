import { describe, test, expect } from "vitest";
import { transformSync } from "@babel/core";
import { readFileSync } from "fs";
import { join } from "path";
import babelPluginDomEditor from "../src/index";

// Helper function to load fixture file
function loadFixture(fixtureName: string): string {
  const fixturePath = join(__dirname, "fixtures", `${fixtureName}.jsx`);
  return readFileSync(fixturePath, "utf-8");
}

// Helper function to transform code with the plugin
function transform(code: string, filename = "test.js") {
  const result = transformSync(code, {
    plugins: [[babelPluginDomEditor, { filename }]],
    parserOpts: {
      plugins: ["jsx", "typescript"],
    },
  });
  return result?.code || "";
}

// Helper to extract attributes from transformed JSX
function getAttributes(
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
  let attrMatch;
  while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
    attributes[attrMatch[1]] = attrMatch[2];
  }

  return attributes;
}

describe("Babel Plugin: DOM Editor", () => {
  describe("Component Root Elements", () => {
    test("should add data-file and data-editor-id to return statement JSX", () => {
      const input = loadFixture("basic-function");
      const output = transform(input, "src/Button.js");
      const buttonAttrs = getAttributes(output, "button");

      expect(buttonAttrs["data-file"]).toBe("src/Button.js");
      expect(buttonAttrs["data-editor-id"]).toMatch(/^button_/);
    });

    test("should add data-file and data-editor-id to arrow function JSX", () => {
      const input = loadFixture("basic-arrow");
      const output = transform(input, "src/Card.jsx");
      const divAttrs = getAttributes(output, "div");

      expect(divAttrs["data-file"]).toBe("src/Card.jsx");
      expect(divAttrs["data-editor-id"]).toMatch(/^card_/);
    });

    test("should generate unique IDs with filename prefix", () => {
      const input = loadFixture("unique-id-test");
      const output1 = transform(input, "src/Hero.js");
      const output2 = transform(input, "src/components/Hero.tsx");

      const attrs1 = getAttributes(output1, "section");
      const attrs2 = getAttributes(output2, "section");

      expect(attrs1["data-editor-id"]).toMatch(/^hero_/);
      expect(attrs2["data-editor-id"]).toMatch(/^hero_/);
      expect(attrs1["data-editor-id"]).not.toBe(attrs2["data-editor-id"]);
    });
  });

  describe("HTML Element Ownership", () => {
    test("should add data-rendered-by to HTML elements inside components", () => {
      const input = loadFixture("nested-html-elements");
      const output = transform(input, "src/Container.js");

      // Root div should have data-file and data-editor-id
      const rootDivAttrs = getAttributes(output, "div");
      expect(rootDivAttrs["data-file"]).toBe("src/Container.js");
      expect(rootDivAttrs["data-editor-id"]).toMatch(/^container_/);

      // Child HTML elements should have data-rendered-by pointing to container
      const componentId = rootDivAttrs["data-editor-id"];

      expect(output).toContain(`<header data-rendered-by="${componentId}"`);
      expect(output).toContain(`<h1 data-rendered-by="${componentId}"`);
      expect(output).toContain(`<main data-rendered-by="${componentId}"`);
      expect(output).toContain(`<p data-rendered-by="${componentId}"`);
    });

    test("should not add data-rendered-by to React components (PascalCase)", () => {
      const input = loadFixture("mixed-html-react");
      const output = transform(input, "src/App.js");

      // React components should not have data-rendered-by
      expect(output).not.toContain("<Header data-rendered-by");
      expect(output).not.toContain("<Button data-rendered-by");

      // But HTML elements should have data-rendered-by
      const rootDivAttrs = getAttributes(output, "div");
      const componentId = rootDivAttrs["data-editor-id"];
      expect(output).toContain(`<main data-rendered-by="${componentId}"`);
    });
  });

  describe("Text Node Wrapping", () => {
    test("should wrap direct text content in component", () => {
      const input = loadFixture("direct-text");
      const output = transform(input, "src/Heading.js");

      // Text should be wrapped in span with data-rendered-by
      expect(output).toContain("<span style={{");
      expect(output).toContain("data-rendered-by=");
      expect(output).toContain("Welcome to our site");
    });

    test("should wrap {children} expression in component", () => {
      const input = loadFixture("children-prop");
      const output = transform(input, "src/Button.js");

      // {children} should be wrapped in span
      expect(output).toContain("<span style={{");
      expect(output).toContain("data-rendered-by=");
      expect(output).toContain("{children}");
    });

    test("should not wrap whitespace-only text nodes", () => {
      const input = loadFixture("whitespace-text");
      const output = transform(input, "src/Layout.js");

      // Should have spans for "Header" and "Main" but not for whitespace
      const spanCount = (output.match(/<span/g) || []).length;
      expect(spanCount).toBe(2); // Only for "Header" and "Main" text
    });
  });

  describe("Nested Component Scenarios", () => {
    test("should handle nested components with proper ownership", () => {
      const input = loadFixture("nested-components");
      const output = transform(input, "src/Card.js");

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

  describe("Fragment Support", () => {
    test("should handle JSX fragments", () => {
      const input = loadFixture("jsx-fragment");
      const output = transform(input, "src/List.js");

      // Fragment children should be treated as roots
      const h2Attrs = getAttributes(output, "h2");
      const ulAttrs = getAttributes(output, "ul");

      expect(h2Attrs["data-file"]).toBe("src/List.js");
      expect(ulAttrs["data-file"]).toBe("src/List.js");
      expect(h2Attrs["data-editor-id"]).toMatch(/^list_/);
      expect(ulAttrs["data-editor-id"]).toMatch(/^list_/);
    });
  });

  describe("Pre-transpiled Code", () => {
    test("should handle React.createElement syntax", () => {
      const input = loadFixture("react-createelement");
      const output = transform(input, "src/Button.js");

      // Should add metadata to button element
      const buttonAttrs = getAttributes(output, "button");
      expect(buttonAttrs["data-file"]).toBe("src/Button.js");
      expect(buttonAttrs["data-editor-id"]).toMatch(/^button_/);

      // Should wrap text content
      expect(output).toContain("<span style={{");
      expect(output).toContain("data-rendered-by");
    });
  });

  describe("Edge Cases", () => {
    test("should skip ImageOptimizer files by default", () => {
      const input = loadFixture("image-optimizer");
      const output = transform(input, "ImageOptimizer.jsx");

      // Should not add any data attributes
      expect(output).not.toContain("data-file");
      expect(output).not.toContain("data-editor-id");
      expect(output).not.toContain("data-rendered-by");
    });

    test("should support custom skipFiles option", () => {
      const input = loadFixture("basic-function");
      const result = transformSync(input, {
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
      expect(output).not.toContain("data-file");
      expect(output).not.toContain("data-editor-id");
      expect(output).not.toContain("data-rendered-by");
    });

    test("should not modify elements that already have data-file", () => {
      const input = loadFixture("existing-data-file");
      const output = transform(input, "src/New.js");

      // Should keep existing data-file and not add new attributes
      expect(output).toContain('data-file="existing.js"');
      expect(output).not.toContain('data-file="src/New.js"');
      expect(output).not.toContain("data-editor-id");
    });
  });

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
        const input = loadFixture("filename-test");
        const output = transform(input, filename);
        const divAttrs = getAttributes(output, "div");

        expect(divAttrs["data-editor-id"]).toMatch(
          new RegExp(`^${expectedPrefix}`),
        );
      });
    });
  });
});
