import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

// Test fixtures
const basicFunctionInput = `function Button() {
  return <button>Click me</button>;
}`;

const basicArrowInput = `const Card = () => <div className="card">Content</div>;`;

const uniqueIdTestInput = `const Hero = () => <section>Hero content</section>;`;

describe("Component Root Elements", () => {
  test("should add data-component-file and data-component-name to return statement JSX", () => {
    const output = transform(basicFunctionInput, "src/Button.js");
    const buttonAttrs = getAttributes(output, "button");

    expect(buttonAttrs["data-component-file"]).toBe("src/Button.js");
    expect(buttonAttrs["data-component-name"]).toBe("Button");
  });

  test("should add data-component-file and data-component-name to arrow function JSX", () => {
    const output = transform(basicArrowInput, "src/Card.jsx");
    const divAttrs = getAttributes(output, "div");

    expect(divAttrs["data-component-file"]).toBe("src/Card.jsx");
    expect(divAttrs["data-component-name"]).toBe("Card");
  });

  test("should generate consistent component metadata", () => {
    const output1 = transform(uniqueIdTestInput, "src/Hero.js");
    const output2 = transform(uniqueIdTestInput, "src/components/Hero.tsx");

    const attrs1 = getAttributes(output1, "section");
    const attrs2 = getAttributes(output2, "section");

    // Should use file path and component name
    expect(attrs1["data-component-file"]).toBe("src/Hero.js");
    expect(attrs1["data-component-name"]).toBe("Hero");
    expect(attrs2["data-component-file"]).toBe("src/components/Hero.tsx");
    expect(attrs2["data-component-name"]).toBe("Hero");
  });
});