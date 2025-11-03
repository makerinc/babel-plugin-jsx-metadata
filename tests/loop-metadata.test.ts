import { describe, expect, test } from "vitest";
import { transform } from "./test-helpers";

const faqsComponent = `
const FAQSection = () => {
  const faqs = [
    { question: "What is automated investing?", answer: "Automated answer.", image: "/faq-1.png" },
    { question: "How much money do I need?", answer: "You can start today.", image: "/faq-2.png" }
  ];

  return (
    <div>
      {faqs.map((faq, index) => (
        <div key={index}>
          <img src={faq.image} alt={faq.question} />
          <span>{faq.question}</span>
          <p>{faq.answer}</p>
        </div>
      ))}
    </div>
  );
};
`;

const dynamicFaqsComponent = `
const FAQSection = () => {
  const faqs = useFaqs();

  return (
    <div>
      {faqs.map((faq) => (
        <div key={faq.id}>
          <span>{faq.question}</span>
        </div>
      ))}
    </div>
  );
};
`;

describe("Loop metadata generation", () => {
  test("adds dynamic IDs and data source metadata for static in-file collections", () => {
    const output = transform(faqsComponent, "Example-static.jsx");

    expect(output).toMatch(/data-editor-id="[a-f0-9]{12}"/);
    expect(output).toMatch(
      /<span[^>]*data-editor-id="[a-f0-9]{12}"[^>]*data-children-source=\{\s*\[[^\]]*\{\\"file\\":\\"Example-static\.jsx\\",\\"start\\":\\"\d+:\d+\\",\\"end\\":\\"\d+:\d+\\"\}[^\]]*\]\s*\[index\]\s*\}/,
    );
    expect(output).toMatch(
      /<p[^>]*data-editor-id="[a-f0-9]{12}"[^>]*data-children-source=\{\s*\[[^\]]*\{\\"file\\":\\"Example-static\.jsx\\",\\"start\\":\\"\d+:\d+\\",\\"end\\":\\"\d+:\d+\\"\}[^\]]*\]\s*\[index\]\s*\}/,
    );
    expect(output).toMatch(
      /<img[^>]*data-editor-id="[a-f0-9]{12}"[^>]*data-img-source=\{\s*\[[^\]]*\{\\"file\\":\\"Example-static\.jsx\\",\\"start\\":\\"\d+:\d+\\",\\"end\\":\\"\d+:\d+\\"\}[^\]]*\]\s*\[index\]\s*\}/,
    );
    expect(output).not.toMatch(
      /<div key=\{index\}[^>]*data-children-source=/,
    );
  });

  test("skips data source metadata when collection is not statically defined in file", () => {
    const output = transform(dynamicFaqsComponent, "Example-dynamic.jsx");

    expect(output).not.toContain("data-children-source=");
    expect(output).not.toContain("data-img-source=");
  });
});
