import { describe, test, expect } from "vitest";
import { transform } from "./test-helpers";

// Test fixtures
const directTextInput = `function Heading() {
  return <h1>Welcome to our site</h1>;
}`;

const childrenPropInput = `function Button({ children }) {
  return <button className="btn">{children}</button>;
}`;

const whitespaceTextInput = `function Layout() {
  return (
    <div>
      <header>Header</header>
      <main>Main</main>
    </div>
  );
}`;

const reactComponentTextInput = `function App() {
  return (
    <div>
      <MyButton>Click me</MyButton>
      <AnotherComponent>Some text</AnotherComponent>
    </div>
  );
}`;

describe("Text Node Wrapping", () => {
  test("should NOT wrap text inside HTML elements", () => {
    const output = transform(directTextInput, "src/Heading.js");

    // Text inside HTML elements should NOT be wrapped (corrected behavior)
    expect(output).not.toContain("<span style={{");
    expect(output).toContain("Welcome to our site");

    // The h1 is the root element, so it gets component metadata not data-rendered-by
    expect(output).toContain('data-component-file="src/Heading.js"');
    expect(output).toContain('data-component-name="Heading"');
  });

  test("should NOT wrap {children} expression to preserve authorship", () => {
    const output = transform(childrenPropInput, "src/Button.js");

    // {children} should NOT be wrapped to preserve authorship across components
    expect(output).toContain("{children}");
    expect(output).not.toContain('data-rendered-by="button_');

    // Button should still get component metadata
    expect(output).toContain('data-component-file="src/Button.js"');
    expect(output).toContain('data-component-name="Button"');
  });

  test("should not wrap text inside HTML elements", () => {
    const output = transform(whitespaceTextInput, "src/Layout.js");

    // HTML elements should NOT have span wrappers (corrected behavior)
    const spanCount = (output.match(/<span/g) || []).length;
    expect(spanCount).toBe(0); // No spans for HTML element text

    // But should have data-rendered-by on the HTML elements
    expect(output).toContain('data-rendered-by="src/Layout.js"');
  });

  test("should wrap text passed TO React components", () => {
    const output = transform(reactComponentTextInput, "src/App.js");

    // Text passed to React components SHOULD be wrapped in spans
    const spanCount = (output.match(/<span/g) || []).length;
    expect(spanCount).toBe(2); // One for each React component text

    // Should wrap "Click me" and "Some text"
    expect(output).toContain('<span data-rendered-by="src/App.js"');
    expect(output).toContain("Click me");
    expect(output).toContain("Some text");
    expect(output).toContain('data-rendered-by="src/App.js"');
  });
});
