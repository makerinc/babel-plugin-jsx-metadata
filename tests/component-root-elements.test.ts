import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

// Test fixtures
const basicFunctionInput = `function Button() {
  return <button>Click me</button>;
}`;

const basicArrowInput = `const Card = () => <div className="card">Content</div>;`;

const uniqueIdTestInput = `const Hero = () => <section>Hero content</section>;`;

describe("Component Root Elements", () => {
  test("should add data-file and data-editor-id to return statement JSX", () => {
    const output = transform(basicFunctionInput, "src/Button.js");
    const buttonAttrs = getAttributes(output, "button");

    expect(buttonAttrs["data-file"]).toBe("src/Button.js");
    expect(buttonAttrs["data-editor-id"]).toMatch(/^button_/);
  });

  test("should add data-file and data-editor-id to arrow function JSX", () => {
    const output = transform(basicArrowInput, "src/Card.jsx");
    const divAttrs = getAttributes(output, "div");

    expect(divAttrs["data-file"]).toBe("src/Card.jsx");
    expect(divAttrs["data-editor-id"]).toMatch(/^card_/);
  });

  test("should generate unique IDs with filename prefix", () => {
    const output1 = transform(uniqueIdTestInput, "src/Hero.js");
    const output2 = transform(uniqueIdTestInput, "src/components/Hero.tsx");

    const attrs1 = getAttributes(output1, "section");
    const attrs2 = getAttributes(output2, "section");

    expect(attrs1["data-editor-id"]).toMatch(/^hero_/);
    expect(attrs2["data-editor-id"]).toMatch(/^hero_/);
    expect(attrs1["data-editor-id"]).not.toBe(attrs2["data-editor-id"]);
  });
});