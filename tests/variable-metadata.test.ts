import { describe, expect, test } from "vitest";
import { transform } from "./test-helpers";

const staticContentComponent = `
const HeroSection = () => {
  const heroContent = {
    title: "Unlock smarter investing",
    image: "/images/hero.png",
  };

  return (
    <section>
      <h1>{heroContent.title}</h1>
      <img src={heroContent.image} alt={heroContent.title} />
    </section>
  );
};
`;

const dynamicContentComponent = `
const HeroSection = () => {
  const heroContent = useHeroContent();

  return (
    <section>
      <h1>{heroContent.title}</h1>
      <img src={heroContent.image} alt={heroContent.title} />
    </section>
  );
};
`;

const simpleVarComponent = `
function Simple() {
  var myVar = "Lorem ipsum";
  const myConst = "Lorem ipsum";
  let myLet = "Lorem ipsum";

  return <>
    <div>{myVar}</div>
    <div>{myConst}</div>
    <div>{myLet}</div>
  </>;
}
`;

describe("Variable metadata generation", () => {
  test("adds data source metadata for static in-file variables", () => {
    const output = transform(staticContentComponent, "Example-variable.jsx");

    expect(output).toMatch(
      /data-children-source="\{\\"file\\":\\"Example-variable\.jsx\\"/,
    );
    expect(output).toMatch(
      /data-img-source="\{\\"file\\":\\"Example-variable\.jsx\\"/,
    );
    // Check that accessor IDs are included
    expect(output).toContain('\\"id\\":\\"heroContent.title\\"');
    expect(output).toContain('\\"id\\":\\"heroContent.image\\"');
  });

  test("skips variable metadata when source is dynamic", () => {
    const output = transform(
      dynamicContentComponent,
      "Example-dynamic-variable.jsx",
    );

    expect(output).not.toContain("data-children-source=");
    expect(output).not.toContain("data-img-source=");
  });

  test("handles simple variable declarations", () => {
    const output = transform(simpleVarComponent, "Example-simple.jsx");

    expect(output).toMatch(
      /data-children-source="\{\\"file\\":\\"Example-simple\.jsx\\"/,
    );
    // Check that simple variable accessor IDs are included
    expect(output).toContain('\\"id\\":\\"myVar\\"');
    expect(output).toContain('\\"id\\":\\"myConst\\"');
    expect(output).toContain('\\"id\\":\\"myLet\\"');
  });
});
