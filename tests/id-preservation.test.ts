import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

describe("ID Preservation During Deduplication", () => {
  test("should preserve existing unique data-editor-id instead of generating new one", () => {
    const input = `
      function Button() {
        return <button data-editor-id="unique123abc">Click me</button>;
      }
    `;

    const output = transform(input, "test.js");
    const buttonAttrs = getAttributes(output, "button");

    // Should preserve the existing unique ID
    expect(buttonAttrs["data-editor-id"]).toBe("unique123abc");
    
    // Should add other metadata
    expect(buttonAttrs["data-component-file"]).toBe("test.js");
    expect(buttonAttrs["data-component-name"]).toBe("Button");
  });

  test("should generate new ID when existing one would cause collision", () => {
    const input = `
      function Container() {
        return (
          <div>
            <span data-editor-id="duplicate123">First</span>
            <span data-editor-id="duplicate123">Second</span>
          </div>
        );
      }
    `;

    const output = transform(input, "test.js");
    
    // Extract all data-editor-id values
    const editorIds = output.match(/data-editor-id="([^"]+)"/g) || [];
    const idValues = editorIds.map(match => match.match(/data-editor-id="([^"]+)"/)?.[1]).filter(Boolean);

    // Should have 3 unique IDs (div + 2 spans)
    expect(idValues).toHaveLength(3);
    expect(new Set(idValues).size).toBe(3);
    
    // One of the spans should keep the original ID, the other should get a new one
    expect(idValues).toContain("duplicate123");
    
    // The other IDs should be valid 12-char hex hashes
    const otherIds = idValues.filter(id => id !== "duplicate123");
    expect(otherIds).toHaveLength(2);
    for (const id of otherIds) {
      expect(id).toMatch(/^[a-f0-9]{12}$/);
    }
  });

  test("should preserve multiple unique existing IDs", () => {
    const input = `
      function Widget() {
        return (
          <div data-editor-id="widget123abc">
            <p data-editor-id="para456def">Paragraph</p>
            <span data-editor-id="span789ghi">Span text</span>
          </div>
        );
      }
    `;

    const output = transform(input, "widget.js");
    
    // Should preserve all existing unique IDs
    expect(output).toContain('data-editor-id="widget123abc"');
    expect(output).toContain('data-editor-id="para456def"');
    expect(output).toContain('data-editor-id="span789ghi"');
    
    // Should have exactly 3 editor IDs
    const editorIds = output.match(/data-editor-id="[^"]+"/g) || [];
    expect(editorIds).toHaveLength(3);
  });

  test("should mix preserved and generated IDs appropriately", () => {
    const input = `
      function Mixed() {
        return (
          <section data-editor-id="existing123">
            <h1>No ID here</h1>
            <p data-editor-id="para456def">Has ID</p>
            <span>No ID here either</span>
          </section>
        );
      }
    `;

    const output = transform(input, "mixed.js");
    
    // Should preserve existing unique IDs
    expect(output).toContain('data-editor-id="existing123"');
    expect(output).toContain('data-editor-id="para456def"');
    
    // Should generate new IDs for elements without them
    const editorIds = output.match(/data-editor-id="([^"]+)"/g) || [];
    const idValues = editorIds.map(match => match.match(/data-editor-id="([^"]+)"/)?.[1]).filter(Boolean);
    
    expect(idValues).toHaveLength(4); // section, h1, p, span
    expect(idValues).toContain("existing123");
    expect(idValues).toContain("para456def");
    
    // The other 2 should be generated 12-char hex hashes
    const generatedIds = idValues.filter(id => !["existing123", "para456def"].includes(id));
    expect(generatedIds).toHaveLength(2);
    for (const id of generatedIds) {
      expect(id).toMatch(/^[a-f0-9]{12}$/);
    }
  });

  test("should handle empty existing IDs by generating new ones", () => {
    const input = `
      function Invalid() {
        return (
          <div data-editor-id="valid-id">
            <span data-editor-id="">Empty ID</span>
            <p data-editor-id="   ">Whitespace only ID</p>
          </div>
        );
      }
    `;

    const output = transform(input, "invalid.js");
    
    // Should preserve valid non-empty ID and generate new ones for empty/whitespace IDs
    const editorIds = output.match(/data-editor-id="([^"]+)"/g) || [];
    const idValues = editorIds.map(match => match.match(/data-editor-id="([^"]+)"/)?.[1]).filter(Boolean);
    
    expect(idValues).toHaveLength(3);
    
    // Should preserve the valid existing ID
    expect(idValues).toContain("valid-id");
    
    // Should not contain the empty IDs
    expect(output).not.toContain('data-editor-id=""');
    expect(output).not.toContain('data-editor-id="   "');
    
    // The other 2 should be generated 12-char hex hashes
    const generatedIds = idValues.filter(id => id !== "valid-id");
    expect(generatedIds).toHaveLength(2);
    for (const id of generatedIds) {
      expect(id).toMatch(/^[a-f0-9]{12}$/);
    }
  });

});