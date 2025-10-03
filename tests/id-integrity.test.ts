import { describe, expect, test } from "vitest";
import { extractDataEditorIds, transform } from "./test-helpers";

describe("ID Integrity Tests", () => {
  const filename = "src/TestComponent.tsx";

  test("should generate identical IDs for identical tree structures with different content", () => {
    const code1 = `
      function Component() {
        return (
          <div>
            <span>Hello</span>
            <button onClick={handleClick}>Click me</button>
          </div>
        );
      }
    `;

    const code2 = `
      function Component() {
        return (
          <div>
            <span>World</span>
            <button onClick={handleDifferentClick}>Different text</button>
          </div>
        );
      }
    `;

    const transformed1 = transform(code1, filename);
    const transformed2 = transform(code2, filename);

    const ids1 = extractDataEditorIds(transformed1);
    const ids2 = extractDataEditorIds(transformed2);

    expect(ids1).toHaveLength(3); // div, span, button
    expect(ids2).toHaveLength(3); // div, span, button
    expect(ids1).toEqual(ids2);
  });

  test("should generate identical IDs for elements with different props", () => {
    const code1 = `
      function Component() {
        return (
          <div className="container">
            <input type="text" placeholder="Enter name" />
            <img src="/image1.jpg" alt="Image 1" />
          </div>
        );
      }
    `;

    const code2 = `
      function Component() {
        return (
          <div className="wrapper">
            <input type="email" placeholder="Enter email" />
            <img src="/image2.jpg" alt="Image 2" />
          </div>
        );
      }
    `;

    const transformed1 = transform(code1, filename);
    const transformed2 = transform(code2, filename);

    const ids1 = extractDataEditorIds(transformed1);
    const ids2 = extractDataEditorIds(transformed2);

    expect(ids1).toEqual(ids2);
  });

  test("should generate different IDs for different element types at same position", () => {
    const code1 = `
      function Component() {
        return (
          <div>
            <span>First</span>
            <button>Second</button>
          </div>
        );
      }
    `;

    const code2 = `
      function Component() {
        return (
          <div>
            <p>First</p>
            <a>Second</a>
          </div>
        );
      }
    `;

    const transformed1 = transform(code1, filename);
    const transformed2 = transform(code2, filename);

    const ids1 = extractDataEditorIds(transformed1);
    const ids2 = extractDataEditorIds(transformed2);

    // Should have different IDs because different element types
    expect(ids1).not.toEqual(ids2);
    // Should be proper 12-char hex hashes
    for (const id of [...ids1, ...ids2]) {
      expect(id).toMatch(/^[a-f0-9]{12}$/);
    }
  });

  test("should generate stable hashed IDs", () => {
    const code = `
      function Component() {
        return (
          <div>
            <span>Content</span>
            <span>More content</span>
            <p>Different type</p>
          </div>
        );
      }
    `;

    const transformed1 = transform(code, filename);
    const transformed2 = transform(code, filename);

    const ids1 = extractDataEditorIds(transformed1);
    const ids2 = extractDataEditorIds(transformed2);

    // Should generate identical hashed IDs across transformations
    expect(ids1).toEqual(ids2);

    // All IDs should be 12-char hex hashes
    for (const id of ids1) {
      expect(id).toMatch(/^[a-f0-9]{12}$/);
    }
  });

  test("should generate different IDs for different files", () => {
    const code = `
      function Component() {
        return (
          <div>
            <span>Content</span>
          </div>
        );
      }
    `;

    const transformed1 = transform(code, "src/Component1.tsx");
    const transformed2 = transform(code, "src/Component2.tsx");

    const ids1 = extractDataEditorIds(transformed1);
    const ids2 = extractDataEditorIds(transformed2);

    expect(ids1).toHaveLength(2);
    expect(ids2).toHaveLength(2);
    expect(ids1).not.toEqual(ids2);
  });

  test("should generate stable IDs across multiple transformations", () => {
    const code = `
      function Component() {
        return (
          <div>
            <span>Hello World</span>
            <button type="submit">Submit</button>
          </div>
        );
      }
    `;

    const transformed1 = transform(code, filename);
    const transformed2 = transform(code, filename);
    const transformed3 = transform(code, filename);

    const ids1 = extractDataEditorIds(transformed1);
    const ids2 = extractDataEditorIds(transformed2);
    const ids3 = extractDataEditorIds(transformed3);

    expect(ids1).toEqual(ids2);
    expect(ids2).toEqual(ids3);
  });

  test("should generate IDs for nested components with different content", () => {
    const code1 = `
      function Component() {
        return (
          <div>
            <header>
              <h1>Title 1</h1>
              <nav>
                <a href="/home">Home</a>
                <a href="/about">About</a>
              </nav>
            </header>
            <main>
              <p>Content 1</p>
            </main>
          </div>
        );
      }
    `;

    const code2 = `
      function Component() {
        return (
          <div>
            <header>
              <h1>Title 2</h1>
              <nav>
                <a href="/products">Products</a>
                <a href="/contact">Contact</a>
              </nav>
            </header>
            <main>
              <p>Content 2</p>
            </main>
          </div>
        );
      }
    `;

    const transformed1 = transform(code1, filename);
    const transformed2 = transform(code2, filename);

    const ids1 = extractDataEditorIds(transformed1);
    const ids2 = extractDataEditorIds(transformed2);

    // Should have same structure, same IDs
    expect(ids1).toEqual(ids2);
    expect(ids1.length).toBe(8); // div, header, h1, nav, a, a, main, p
  });

  test("should provide unique IDs across different files", () => {
    // Test many similar components in different files
    const baseCode = `
      function Component() {
        return (
          <div>
            <span>Content</span>
          </div>
        );
      }
    `;

    const ids = new Set<string>();

    // Generate variations across different files
    for (let i = 0; i < 50; i++) {
      const transformed = transform(baseCode, `src/Component${i}.tsx`);
      const extractedIds = extractDataEditorIds(transformed);

      // Check that none of the IDs collide across files
      for (const id of extractedIds) {
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    }

    // Should have collected many unique IDs (50 files * 2 elements each)
    expect(ids.size).toBe(100);
  });
});
