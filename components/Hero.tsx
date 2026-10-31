"use client";

import Image from "next/image";
import AddBookButton from "@/components/library/AddBookButton";

const steps = [
  {
    number: 1,
    title: "Upload PDF",
    description: "Add your book file",
  },
  {
    number: 2,
    title: "AI Processing",
    description: "We analyze the content",
  },
  {
    number: 3,
    title: "Voice Chat",
    description: "Discuss with AI",
  },
];

const Hero = () => {
  return (
    <section className="w-full pt-10 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main beige card */}
        <div className="bg-[#F5E6D3] rounded-3xl p-8 md:p-12 lg:p-16">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
            {/* Left Section - Text & CTA */}
            <div className="flex-1 text-center lg:text-left">
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                Your Library
              </h1>
              <p className="text-gray-600 text-lg mb-8 max-w-md mx-auto lg:mx-0">
                Convert your books into interactive AI conversations.
                <br />
                Listen, learn, and discuss your favorite reads.
              </p>
              <div className="inline-flex">
                <AddBookButton />
              </div>
            </div>

            {/* Center Section - Illustration */}
            <div className="flex-1 flex justify-center">
              <Image
                src="/assets/hero-illustration.png"
                alt="Vintage books with globe and lamp"
                width={500}
                height={350}
                className="w-full max-w-md h-auto object-contain"
                priority
              />
            </div>
          </div>

          {/* Bottom - 3 Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 pt-8 border-t border-[#E8D5C0]">
            {steps.map((step) => (
              <div key={step.number} className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[#663820] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {step.number}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{step.title}</h3>
                  <p className="text-sm text-gray-500">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
