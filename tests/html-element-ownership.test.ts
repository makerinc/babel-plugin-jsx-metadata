import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

// Test fixtures
const nestedHtmlElementsInput = `function Container() {
  return (
    <div className="container">
      <header>
        <h1>Title</h1>
      </header>
      <main>
        <p>Content</p>
      </main>
    </div>
  );
}`;

const mixedHtmlReactInput = `function App() {
  return (
    <div>
      <Header />
      <main>
        <Button>Click me</Button>
      </main>
    </div>
  );
}`;

describe("HTML Element Ownership", () => {
  test("should add data-rendered-by to HTML elements inside components", () => {
    const output = transform(nestedHtmlElementsInput, "src/Container.js");

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
    const output = transform(mixedHtmlReactInput, "src/App.js");

    // React components should not have data-rendered-by
    expect(output).not.toContain("<Header data-rendered-by");
    expect(output).not.toContain("<Button data-rendered-by");

    // But HTML elements should have data-rendered-by
    const rootDivAttrs = getAttributes(output, "div");
    const componentId = rootDivAttrs["data-editor-id"];
    expect(output).toContain(`<main data-rendered-by="${componentId}"`);
  });
});