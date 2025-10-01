import { describe, test, expect } from "vitest";
import { transform, getAttributes } from "./test-helpers";

// Real-world complex scenarios for testing plugin behavior
const heroWithButtonInput = `const Button = ({
  children,
  variant = "primary",
  size = "medium",
  onClick,
  disabled = false,
  className = "",
  ...props
}) => {
  // Base button styles
  const baseStyles =
    "inline-flex items-center justify-center font-medium cursor-pointer transition-all duration-duration-150 ease-ease-in-out focus:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

  // Variant styles
  const variants = {
    primary:
      "text-primary-primary-blue-midtone bg-neutral-white-light border-1 border-solid border-neutral-white-light hover:bg-neutral-gray-50-light shadow-md hover:shadow-lg",
    secondary:
      "text-neutral-white-light bg-transparent border-1 border-solid border-neutral-white-light hover:bg-neutral-white-light hover:text-primary-primary-blue-midtone",
    outline:
      "text-primary-primary-blue-midtone bg-transparent border-1 border-solid border-primary-primary-blue-midtone hover:bg-primary-primary-blue-midtone hover:text-neutral-white-light",
  };

  // Size styles
  const sizes = {
    small: "text-sm leading-tight px-4 py-2 rounded",
    medium: "text-base leading-loose px-8 py-4 rounded-md",
    large: "text-lg leading-relaxed px-10 py-5 rounded-lg",
  };

  const buttonClasses = \`\${baseStyles} \${variants[variant]} \${sizes[size]} \${className}\`;

  return (
    <button
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

const Hero = () => {
  return (
    <section className="bg-gradient-primary relative overflow-hidden">
      <div className="container mx-auto px-4 py-20 lg:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-h1 text-neutral-white-light mb-6">
            Welcome to Your Digital Future
          </h1>

          <p className="text-body-large text-neutral-white-light opacity-90 mb-8 max-w-2xl mx-auto">
            Transform your ideas into reality with our cutting-edge solutions.
            Built for modern businesses that demand excellence and innovation.
          </p>

          <Button variant="primary" size="medium">
            Get Started Today
          </Button>
        </div>
      </div>
    </section>
  );
};`;

describe("Complex Real-World Scenarios", () => {
  test("should properly handle text wrapping in nested component hierarchies", () => {
    const output = transform(heroWithButtonInput, "src/Hero.js");

    // Hero component should have proper attributes
    const heroAttrs = getAttributes(output, "section");
    expect(heroAttrs["data-component-file"]).toBe("src/Hero.js");
    expect(heroAttrs["data-component-name"]).toBe("Hero");

    // Button component should have proper attributes
    const buttonAttrs = getAttributes(output, "button");
    expect(buttonAttrs["data-component-file"]).toBe("src/Hero.js");
    expect(buttonAttrs["data-component-name"]).toBe("Button");

    // The text "Get Started Today" should be wrapped in a span
    // with src/Hero.js in data-rendered-by (file authored this text)
    expect(output).toContain("Get Started Today");
    expect(output).toContain(`data-rendered-by="src/Hero.js"`);

    // Should have spans for text wrapping
    expect(output).toContain('<span data-rendered-by="src/Hero.js"');
  });
});
