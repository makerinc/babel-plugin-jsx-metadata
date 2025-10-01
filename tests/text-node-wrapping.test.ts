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

describe("Text Node Wrapping", () => {
  test("should wrap direct text content in component", () => {
    const output = transform(directTextInput, "src/Heading.js");

    // Text should be wrapped in span with data-rendered-by
    expect(output).toContain("<span style={{");
    expect(output).toContain("data-rendered-by=");
    expect(output).toContain("Welcome to our site");
  });

  test("should NOT wrap {children} expression to preserve authorship", () => {
    const output = transform(childrenPropInput, "src/Button.js");

    // {children} should NOT be wrapped to preserve authorship across components
    expect(output).toContain("{children}");
    expect(output).not.toContain("data-rendered-by=\"button_");
    
    // Button should still get its editor-id
    expect(output).toContain("data-editor-id=\"button_");
  });

  test("should not wrap whitespace-only text nodes", () => {
    const output = transform(whitespaceTextInput, "src/Layout.js");

    // Should have spans for "Header" and "Main" but not for whitespace
    const spanCount = (output.match(/<span/g) || []).length;
    expect(spanCount).toBe(2); // Only for "Header" and "Main" text
  });
});