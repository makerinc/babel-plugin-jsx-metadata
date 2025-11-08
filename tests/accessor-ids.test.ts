import { describe, expect, test } from "vitest";
import { transform } from "./test-helpers";

const complexAccessorComponent = `
const TestComponent = () => {
  const data = {
    user: {
      profile: {
        name: "John Doe",
        settings: {
          theme: "dark"
        }
      }
    },
    "special-key": "special value"
  };

  const items = [
    { title: "First Item", price: 10.99 },
    { title: "Second Item", price: 20.50 }
  ];

  return (
    <div>
      <h1>{data.user.profile.name}</h1>
      <p>Theme: {data.user.profile.settings.theme}</p>
      <span>{data["special-key"]}</span>
      {items.map((item, index) => (
        <div key={index}>
          <h3>{item.title}</h3>
          <span>\${item.price}</span>
        </div>
      ))}
    </div>
  );
};
`;

const bracketNotationComponent = `
const App = () => {
  const config = {
    "api-endpoint": "https://api.example.com",
    123: "numeric key value"
  };

  return (
    <div>
      <p>{config["api-endpoint"]}</p>
      <span>{config[123]}</span>
    </div>
  );
};
`;

describe("Accessor ID generation", () => {
  test("generates correct accessor IDs for nested object access", () => {
    const output = transform(complexAccessorComponent, "TestComponent.jsx");

    // Check nested property access
    expect(output).toContain('\\"id\\":\\"data.user.profile.name\\"');
    expect(output).toContain('\\"id\\":\\"data.user.profile.settings.theme\\"');
  });

  test("handles bracket notation for special property names", () => {
    const output = transform(complexAccessorComponent, "TestComponent.jsx");

    // Check bracket notation for special keys (note: the backslashes are escaped in JSON)
    expect(output).toContain('\\"id\\":\\"data[\\\\\\"special-key\\\\\\"]\\"');
  });

  test("generates accessor IDs for bracket notation with various key types", () => {
    const output = transform(bracketNotationComponent, "App.jsx");

    // Check different bracket notation patterns
    expect(output).toContain(
      '\\"id\\":\\"config[\\\\\\"api-endpoint\\\\\\"]\\"',
    );

    // Numeric key access should now generate metadata
    expect(output).toContain('\\"id\\":\\"config[\\\\\\"123\\\\\\"]\\"');
  });

  test("generates correct IDs for loop variable access", () => {
    const output = transform(complexAccessorComponent, "TestComponent.jsx");

    // Check that loop variable access includes collection source
    expect(output).toContain('\\"id\\":\\"items.title\\"');
    expect(output).toContain('\\"id\\":\\"items.price\\"');
    
    // Also verify main data structure access still works
    expect(output).toContain('\\"id\\":\\"data.user.profile.name\\"');
    expect(output).toContain('\\"id\\":\\"data.user.profile.settings.theme\\"');
  });

  test("maintains backward compatibility with existing metadata", () => {
    const output = transform(complexAccessorComponent, "TestComponent.jsx");

    // Ensure all metadata still includes file, start, and end (using simpler checks)
    expect(output).toContain('\\"file\\":\\"TestComponent.jsx\\"');
    expect(output).toMatch(/\\"start\\":\\"\d+:\d+\\"/);
    expect(output).toMatch(/\\"end\\":\\"\d+:\d+\\"/);

    // And ensure the new id field is present
    expect(output).toContain('\\"id\\":\\"data.user.profile.name\\"');
  });
});
