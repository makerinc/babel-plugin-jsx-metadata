import React, { useState } from "react";

const FAQSection = () => {
  const [openIndex, setOpenIndex] = useState(null);

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "What is automated investing and how does it work?",
      answer:
        "Automated investing uses advanced algorithms to build and manage your portfolio based on your goals, risk tolerance, and timeline. Once you set up your account, we automatically invest your money in a diversified portfolio of ETFs, rebalance when needed, and optimize for tax efficiency. You don't need to pick individual stocks or time the market—we handle it all for you.",
    },
    {
      question: "How much money do I need to start investing?",
      answer:
        "You can start investing with no minimum deposit. Whether you want to invest $10 or $10,000, we'll help you build a diversified portfolio. Our platform is designed to make investing accessible to everyone, regardless of their financial situation.",
    },
    {
      question: "What fees do you charge?",
      answer:
        "We charge a simple annual fee of 0.25% for our Digital plan (or $4/month for balances under $20,000). Our Premium plan, which includes unlimited access to certified financial planners, costs 0.40% annually. There are no trading commissions, no transfer fees, and no fees to withdraw your money.",
    },
    {
      question: "Is my money safe and insured?",
      answer:
        "Yes, your money is safe. We partner with multiple SIPC-member banks and broker-dealers, which means your investments are protected up to $500,000 (including $250,000 for cash claims). Additionally, our cash accounts are FDIC-insured through our program banks for up to $2 million. We use bank-level security and encryption to protect your personal information.",
    },
    {
      question: "Can I withdraw my money at any time?",
      answer:
        "Absolutely. You have complete control over your money and can withdraw funds at any time with no penalties or withdrawal fees. Most withdrawals are processed within 3-5 business days. Keep in mind that frequent withdrawals may impact your long-term investment strategy, so we recommend keeping emergency savings separate from your investment accounts.",
    },
    {
      question:
        "What's the difference between taxable and retirement accounts?",
      answer:
        "Taxable accounts offer flexibility to withdraw anytime without penalties, but you'll pay taxes on investment gains. Retirement accounts like IRAs and 401(k)s provide tax advantages—either tax-deferred growth (Traditional) or tax-free withdrawals in retirement (Roth)—but have contribution limits and early withdrawal penalties before age 59½. We can help you decide which account type best fits your goals.",
    },
  ];

  return (
    <section className="w-full bg-neutral-white py-16 md:py-24">
      <div className="max-w-[960px] mx-auto px-6 md:px-12">
        {/* Section Header */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="font-gt-america font-medium text-3xl leading-snug tracking-[-0.4px] sm:text-[60px] sm:leading-[64px] sm:tracking-[-0.5px] md:text-4xl md:leading-normal md:tracking-[-0.7px] text-neutral-800 mb-4">
            Frequently Asked Questions
          </h2>
          <p className="font-gt-america font-normal text-base leading-tightest tracking-[-0.13px] text-neutral-600 max-w-[640px] mx-auto">
            Get answers to common questions about investing, fees, security, and
            account management.
          </p>
        </div>

        {/* FAQ Items */}
        <div className="space-y-0">
          {faqs.map((faq, index) => (
            <div key={index} className="border-b border-neutral-300">
              <button
                onClick={() => toggleFAQ(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleFAQ(index);
                  }
                }}
                className="w-full text-left py-6 md:py-8 flex items-start justify-between gap-6 hover:bg-neutral-100/50 px-4 md:px-6 transition-all duration-300 ease-ease cursor-pointer"
                aria-expanded={openIndex === index}
                aria-controls={`faq-answer-${index}`}
              >
                <span className="font-gt-america font-medium text-lg leading-tightest tracking-[-0.16px] sm:text-[22px] sm:leading-[26px] sm:tracking-[-0.18px] md:text-xl md:leading-tighter md:tracking-[-0.2px] text-neutral-800 flex-1">
                  {faq.question}
                </span>
                <span
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-primary-blue-600 transition-transform duration-300 ease-ease"
                  style={{
                    transform:
                      openIndex === index ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    {openIndex === index ? (
                      <path
                        d="M19 12H5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : (
                      <>
                        <path
                          d="M12 5V19"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M5 12H19"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    )}
                  </svg>
                </span>
              </button>

              <div
                id={`faq-answer-${index}`}
                role="region"
                aria-labelledby={`faq-question-${index}`}
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  openIndex === index
                    ? "max-h-[500px] opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="px-4 md:px-6 pb-6 md:pb-8">
                  <p className="font-gt-america font-normal text-base leading-tightest tracking-[-0.13px] text-neutral-600">
                    {faq.answer}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Optional CTA */}
        <div className="text-center mt-12 md:mt-16">
          <p className="font-gt-america font-normal text-base leading-tightest tracking-[-0.13px] text-neutral-600 mb-6">
            Still have questions? We're here to help.
          </p>
          <button className="font-gt-america text-base font-medium leading-cramped text-center cursor-pointer transition-all duration-200 ease-ease border-none bg-primary-blue-600 text-neutral-white px-[20px] py-2.5 rounded-base hover:bg-[#1558b8]">
            Contact Support
          </button>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
