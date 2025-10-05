import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

describe("Attribute Deduplication", () => {
  test("should update existing data-component-file instead of duplicating", () => {
    const input = `
      function Button() {
        return <button data-component-file="old-file.js">Click me</button>;
      }
    `;

    const output = transform(input, "new-file.js");
    const buttonAttrs = getAttributes(output, "button");

    // Should have updated the existing attribute, not duplicated
    expect(buttonAttrs["data-component-file"]).toBe("new-file.js");
    
    // Should also add other metadata attributes
    expect(buttonAttrs["data-component-name"]).toBe("Button");
    expect(buttonAttrs["data-editor-id"]).toMatch(/^[a-f0-9]{12}$/);
    
    // Should only appear once in the output
    const componentFileCount = (output.match(/data-component-file=/g) || []).length;
    expect(componentFileCount).toBe(1);
  });

  test("should update existing data-component-name instead of duplicating", () => {
    const input = `
      function Button() {
        return <button data-component-name="OldName">Click me</button>;
      }
    `;

    const output = transform(input, "test.js");
    const buttonAttrs = getAttributes(output, "button");

    // Should have updated to the actual component name
    expect(buttonAttrs["data-component-name"]).toBe("Button");
    
    // Should only appear once in the output
    const componentNameCount = (output.match(/data-component-name=/g) || []).length;
    expect(componentNameCount).toBe(1);
  });

  test("should update existing data-editor-id instead of duplicating", () => {
    const input = `
      function Button() {
        return <button data-editor-id="old-id-123">Click me</button>;
      }
    `;

    const output = transform(input, "test.js");
    const buttonAttrs = getAttributes(output, "button");

    // Should have a new editor ID (12-char hex)
    expect(buttonAttrs["data-editor-id"]).toMatch(/^[a-f0-9]{12}$/);
    expect(buttonAttrs["data-editor-id"]).not.toBe("old-id-123");
    
    // Should only appear once in the output
    const editorIdCount = (output.match(/data-editor-id=/g) || []).length;
    expect(editorIdCount).toBe(1);
  });

  test("should update existing data-rendered-by instead of duplicating", () => {
    const input = `
      function Container() {
        return (
          <div>
            <span data-rendered-by="old-file.js">Content</span>
          </div>
        );
      }
    `;

    const output = transform(input, "new-file.js");
    const spanAttrs = getAttributes(output, "span");

    // Should have updated the rendered-by attribute
    expect(spanAttrs["data-rendered-by"]).toBe("new-file.js");
    
    // Should only appear once for the span element
    const spanMatch = output.match(/<span[^>]*>/);
    expect(spanMatch).toBeTruthy();
    const spanRenderedByCount = (spanMatch![0].match(/data-rendered-by=/g) || []).length;
    expect(spanRenderedByCount).toBe(1);
  });

  test("should update all existing attributes simultaneously", () => {
    const input = `
      function Card() {
        return (
          <div 
            data-component-file="old.js"
            data-component-name="OldCard"
            data-editor-id="old-id"
            data-component-line-start="999"
            data-component-line-end="999"
          >
            Content
          </div>
        );
      }
    `;

    const output = transform(input, "new-card.js");
    const divAttrs = getAttributes(output, "div");

    // All attributes should be updated with new values
    expect(divAttrs["data-component-file"]).toBe("new-card.js");
    expect(divAttrs["data-component-name"]).toBe("Card");
    expect(divAttrs["data-editor-id"]).toMatch(/^[a-f0-9]{12}$/);
    expect(divAttrs["data-editor-id"]).not.toBe("old-id");
    expect(divAttrs["data-component-line-start"]).not.toBe("999");
    expect(divAttrs["data-component-line-end"]).not.toBe("999");

    // No attributes should be duplicated
    const attributeNames = [
      "data-component-file",
      "data-component-name", 
      "data-editor-id",
      "data-component-line-start",
      "data-component-line-end"
    ];

    for (const attrName of attributeNames) {
      const count = (output.match(new RegExp(`${attrName}=`, 'g')) || []).length;
      expect(count).toBe(1);
    }
  });

  test("should update attributes on non-root elements (deduplication behavior)", () => {
    const input = `
      function Widget() {
        return (
          <section className="widget">
            <p data-rendered-by="old.js" data-editor-id="old-id">Text</p>
          </section>
        );
      }
    `;

    const output = transform(input, "widget.js");
    
    // Section (root) should get new component attributes
    const sectionAttrs = getAttributes(output, "section");
    expect(sectionAttrs["data-component-file"]).toBe("widget.js");
    expect(sectionAttrs["data-component-name"]).toBe("Widget");
    expect(sectionAttrs["data-editor-id"]).toMatch(/^[a-f0-9]{12}$/);
    
    // P (non-root) should have updated rendered-by and editor-id (deduplication!)
    const pAttrs = getAttributes(output, "p");
    expect(pAttrs["data-rendered-by"]).toBe("widget.js");
    expect(pAttrs["data-editor-id"]).toMatch(/^[a-f0-9]{12}$/);
    expect(pAttrs["data-editor-id"]).not.toBe("old-id");
    
    // Should only have one of each attribute (no duplicates)
    const pMatch = output.match(/<p[^>]*>/);
    expect(pMatch).toBeTruthy();
    const pRenderedByCount = (pMatch![0].match(/data-rendered-by=/g) || []).length;
    const pEditorIdCount = (pMatch![0].match(/data-editor-id=/g) || []).length;
    expect(pRenderedByCount).toBe(1);
    expect(pEditorIdCount).toBe(1);
    
    // Original className should be preserved
    expect(output).toContain('className="widget"');
  });

  test("should handle root elements without data-component-file (normal processing)", () => {
    const input = `
      function Button() {
        return <button data-editor-id="should-be-updated">Click me</button>;
      }
    `;

    const output = transform(input, "button.js");
    const buttonAttrs = getAttributes(output, "button");

    // Should add new component metadata since no data-component-file exists
    expect(buttonAttrs["data-component-file"]).toBe("button.js");
    expect(buttonAttrs["data-component-name"]).toBe("Button");
    expect(buttonAttrs["data-editor-id"]).toMatch(/^[a-f0-9]{12}$/);
    expect(buttonAttrs["data-editor-id"]).not.toBe("should-be-updated");
    
    // Should only appear once in the output (no duplicates)
    const editorIdCount = (output.match(/data-editor-id=/g) || []).length;
    expect(editorIdCount).toBe(1);
  });
});