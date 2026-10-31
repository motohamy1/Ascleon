import { IBook, IBookSegmentData } from "@/types";
import {
  ReferenceResource,
  QBankVignette,
  HighYieldMnemonic,
} from "@/types/knowledge";

export interface BookDomainContext {
  authoritativeReferences: ReferenceResource[];
  qbankVignettes: QBankVignette[];
  mnemonics: HighYieldMnemonic[];
  sectionSummary: string;
}

interface InternalBookSegmentDefinition {
  title: string;
  pageNumber: number;
  content: string;
}

interface InternalBookData {
  id: string;
  slug: string;
  title: string;
  author: string;
  topic: string;
  segments: InternalBookSegmentDefinition[];
  domainContext: {
    authoritativeReferences: ReferenceResource[];
    qbankVignettes: QBankVignette[];
    mnemonics: HighYieldMnemonic[];
    sectionSummaries: string[];
    defaultSummary: string;
  };
}

const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

export const SAMPLE_BOOKS_KNOWLEDGE: Record<string, InternalBookData> = {
  "clean-code": {
    id: "1",
    slug: "clean-code",
    title: "Clean Code",
    author: "Robert Cecil Martin",
    topic: "Engineering",
    segments: [
      {
        title: "Chapter 1 & 2: Clean Code and Meaningful Names",
        pageNumber: 1,
        content: `It is not enough for code to work. The true cost of software lies in its maintenance, readability, and resistance to regression. Bad code can bring a development organization to its knees, creating a downward spiral of declining velocity, fragile workarounds, and inevitable total system rewrites. Clean code is simple, direct, readable like well-written prose, and leaves no doubt about its author's intent.\n\nChoosing names requires diligence and empathy for future readers. Names must reveal intent immediately: why a variable exists, what it does, and how it is used. Avoid disinformation and cryptic abbreviations such as single-letter loop counters outside trivial indexers. Make meaningful distinctions: distinct concepts must possess unambiguously distinct identifiers rather than noise words like Data, Info, or Item. Above all, adopt the Boy Scout Rule: 'Always leave the campground cleaner than you found it.' If every developer checks in code that is slightly cleaner than when they checked it out, codebases will never rot.`,
      },
      {
        title: "Chapter 3: Functions and the Single Responsibility Principle",
        pageNumber: 29,
        content: `The first rule of functions is that they should be small. The second rule is that they should be smaller than that. Functions should do one thing, they should do it well, and they should do it only. When a function executes multiple operations across differing levels of abstraction, comprehension degrades rapidly. Readers must not be forced to juggle low-level byte operations alongside high-level business workflow decisions within the same block of code.\n\nWe achieve clarity through the Stepdown Rule: reading code from top to bottom should read like a narrative of descending abstraction levels. Every function should introduce the next logical step. Strive for zero or one argument; two arguments are acceptable when natural coordinates exist, but three or more require bundling into dedicated parameter objects. Furthermore, adhere strictly to Command Query Separation (CQS): a function must either perform an action or return information, but never both. Prefer idiomatic exceptions to returning error codes to prevent cluttering calling logic with nested conditional checks.`,
      },
      {
        title: "Chapter 8 & 9: Boundaries, Clean Tests, and TDD Laws",
        pageNumber: 114,
        content: `Software boundaries separate our proprietary domain models from third-party libraries, operating systems, and foreign APIs. When integrating third-party dependencies, do not infect core application services with external abstractions. Write learning tests to explore unfamiliar libraries; this isolates boundary behavior and alerts your team immediately when vendor upgrades break assumptions. Encapsulate third-party boundaries using the Adapter or Facade pattern so that our system depends on an interface we control, rather than an interface forced upon us.\n\nUnit test code is just as important as production code; it demands the same rigor, clean naming, and modularity. Without clean tests, changes to production code become perilous, breeding fear of refactoring. Follow the Three Laws of TDD: you may not write production code until you have written a failing unit test; you may not write more of a unit test than is sufficient to fail; and you may not write more production code than is sufficient to pass the test. Follow the F.I.R.S.T. criteria: tests must be Fast, Independent, Repeatable, Self-Validating, and Timely.`,
      },
    ],
    domainContext: {
      authoritativeReferences: [
        {
          id: "ref-clean-code-01",
          source: "Clean Code: A Handbook of Agile Software Craftsmanship",
          edition: "1st Edition",
          type: "textbook",
          title: "Functions, Naming, and the Single Responsibility Principle",
          chapterOrSection: "Chapters 2 & 3",
          excerpt:
            "Functions should do one thing. They should do it well. They should do it only. If a function only does those steps that are one level below the stated name of the function, then the function is doing one thing.",
          clinicalPearls: [
            "Functions must not exceed one level of abstraction beneath their identifier.",
            "Command Query Separation prevents hidden state mutations inside accessor methods.",
            "The Boy Scout Rule guarantees continuous codebase health over multi-year sprints.",
          ],
          relevanceTag: "clean_code_craftsmanship",
        },
        {
          id: "ref-clean-arch-solid-01",
          source: "Clean Architecture: A Craftsman's Guide to Software Structure",
          edition: "1st Edition",
          type: "textbook",
          title: "SOLID Principles and Component Boundaries",
          chapterOrSection: "Part III: Design Principles",
          excerpt:
            "The Dependency Inversion Principle tells us that high-level modules should never depend on low-level modules; both must depend on abstractions. Interfaces belong to the client invoking the contract, never to the provider supplying the implementation.",
          clinicalPearls: [
            "Entities and use-cases reside at the core and remain agnostic of UI and databases.",
            "Single Responsibility Principle dictates that a module has one, and only one, reason to change.",
          ],
          relevanceTag: "solid_design_principles",
        },
      ],
      qbankVignettes: [
        {
          id: "qbank-clean-code-01",
          examType: "Software Architecture",
          topic: "Refactoring & SOLID Principle Compliance",
          difficulty: "hard",
          vignette:
            "A senior backend engineer reviews an invoice generation service. The processInvoice() function handles parsing input JSON, validating client credit ratings, computing localized tax brackets, calling an external Stripe HTTP endpoint, generating a PDF invoice file, and executing a direct SQL INSERT into the database. A junior developer proposes adding email dispatch directly into the same method.\n\nWhich refactoring strategy best satisfies Clean Code architecture and SOLID principles?",
          options: [
            "Add the email dispatch logic inside a try/catch block at the end of processInvoice to preserve transactional flow",
            "Extract private helper functions within the same class to keep all invoice operations encapsulated in one file",
            "Decompose processInvoice by delegating responsibilities to dedicated domain services (CreditValidator, TaxCalculator, PaymentGateway, InvoiceRepository) coordinated via an orchestrating use-case",
            "Introduce a global static event bus where processInvoice emits untyped string events after every mutating step",
          ],
          correctIndex: 2,
          distractorRationales: {
            0: "Incorrect: Appending more duties to an already bloated method exacerbates the violation of Single Responsibility Principle.",
            1: "Incorrect: Simply breaking code into private methods inside the same class does not eliminate class-level high coupling or separate disparate concerns.",
            2: "Correct: Decomposing into single-responsibility collaborators behind clean interfaces decouples business logic from external I/O, isolates reasons to change, and makes every component independently unit testable.",
            3: "Incorrect: Untyped static event buses introduce unpredictable runtime side effects and compromise compile-time type safety.",
          },
          highYieldTakeaway:
            "A class or function should have only one reason to change. Separate orthogonal concerns into discrete collaborators adhering to clean boundary abstractions.",
          sourceQBank: "Agile Software Craftsmanship Qualifying Bank",
        },
      ],
      mnemonics: [
        {
          mnemonic: "SOLID",
          expansion:
            "Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion",
          rule: "Verify every architectural module against the five canonical object-oriented design pillars.",
          clinicalContext: "Object-oriented design and modular software decoupling.",
        },
        {
          mnemonic: "F.I.R.S.T.",
          expansion: "Fast, Independent, Repeatable, Self-Validating, Timely",
          rule: "Every automated unit test must satisfy all five criteria to ensure regression safety and high velocity.",
          clinicalContext: "Test-Driven Development and automated test suite design.",
        },
      ],
      sectionSummaries: [
        "Focus on intentional naming conventions, readability as communication, and applying the Boy Scout Rule to prevent technical rot.",
        "Deconstruct functions to small, single-responsibility units adhering to Command Query Separation and the Stepdown Rule.",
        "Establish boundary abstractions with adapters and enforce the Three Laws of TDD alongside F.I.R.S.T. unit test standards.",
      ],
      defaultSummary:
        "Clean Architecture & SOLID principles: crafting readable, maintainable software via single responsibility, boundary isolation, and test-driven discipline.",
    },
  },

  "javascript-the-definitive-guide": {
    id: "2",
    slug: "javascript-the-definitive-guide",
    title: "JavaScript: The Definitive Guide",
    author: "David Flanagan",
    topic: "Programming",
    segments: [
      {
        title: "Chapter 3 & 4: Lexical Scoping, Closures, and Execution Environments",
        pageNumber: 42,
        content: `JavaScript relies fundamentally on lexical scoping. The scope of an identifier is determined statically by its location within the source text, not dynamically by where it is called at runtime. Every function invocation creates an execution context with an associated Environment Record that stores local bindings. When a function references an identifier, the JavaScript engine traverses the lexical environment chain outwards from the innermost block until the global environment is reached.\n\nA closure is the combination of a function bundled together with references to its surrounding state (the lexical environment). Closures allow inner functions to retain access to variables declared in an enclosing scope even after that outer function has returned and popped off the call stack. This mechanism provides data encapsulation, functional currying, and memoization. However, unreleased closure references can prevent garbage collectors from reclaiming memory, demanding care when attaching long-lived event listeners or retaining heavy DOM nodes.`,
      },
      {
        title: "Chapter 6 & 9: Prototypal Inheritance, Object Descriptors, and Classes",
        pageNumber: 118,
        content: `Unlike class-based languages such as Java or C++, JavaScript uses prototypal inheritance. Every object maintains an internal link [[Prototype]] (exposed via Object.getPrototypeOf) pointing to another object from which it inherits properties. When querying a property, the runtime checks the instance directly; if not found, it ascends the prototype chain until matching the property or terminating at null. ES6 class syntax is syntactic sugar over this prototype chain, establishing constructor prototypes and superclass delegation.\n\nProperty attributes can be precisely calibrated using Object.defineProperty. Properties are governed by descriptors: value, writable, enumerable, and configurable. Non-enumerable properties are omitted during for...in and Object.keys iteration, while non-configurable properties prevent descriptor alterations or deletion. Understanding descriptors is paramount for writing immutable domain entities, metaprogramming abstractions, and building rock-solid framework plugins.`,
      },
      {
        title: "Chapter 13: Asynchronous Programming, Promises, and the Event Loop",
        pageNumber: 230,
        content: `JavaScript is single-threaded and non-blocking, orchestrated by the Event Loop. The execution model consists of the Call Stack, the Web API / Node C++ thread pool, the Task (Macrotask) Queue, and the Microtask Queue. Synchronous code executes straight on the Call Stack. Asynchronous callbacks are offloaded to host APIs and upon completion are enqueued into their appropriate queues.\n\nMicrotasks, which encompass Promise resolution callbacks (.then/.catch/finally) and queueMicrotask, hold strict priority over macrotasks (such as setTimeout, setInterval, and I/O events). The event loop empties the entire microtask queue before rendering UI frames or dispatching the next macrotask. Modern async/await syntax transforms asynchronous workflows into sequential reading structures while preserving non-blocking execution under the hood. Proper handling of rejection states and AbortController cancellation prevents hanging operations and race conditions.`,
      },
    ],
    domainContext: {
      authoritativeReferences: [
        {
          id: "ref-js-guide-01",
          source: "JavaScript: The Definitive Guide (David Flanagan)",
          edition: "7th Edition",
          type: "textbook",
          title: "Lexical Scope, Closures, and Execution Environments",
          chapterOrSection: "Chapters 3 & 8",
          excerpt:
            "A closure is an instance of a function that retains access to variables in its outer lexical scope even after that outer scope has finished execution. Lexical scoping means functions are executed using the scope chain that was in effect when they were defined.",
          clinicalPearls: [
            "Closures capture references to outer variables, not static snapshots of values.",
            "Block scoping via let/const prevents variable hoisting anomalies inherent to var.",
          ],
          relevanceTag: "javascript_lexical_scoping",
        },
        {
          id: "ref-ecma-spec-01",
          source: "ECMA-262 ECMAScript Language Specification",
          edition: "2024 Edition",
          type: "guideline",
          title: "RunJobs and Microtask Queue Execution Model",
          chapterOrSection: "Section 8.6: Jobs and Job Queues",
          excerpt:
            "Execution of a Job can be initiated only when there is no running execution context and the execution context stack is empty. All Microtasks enqueued during the current turn of the event loop must be executed to exhaustion before taking the next Task.",
          clinicalPearls: [
            "Microtasks always preempt macrotasks: Promise callbacks execute before setTimeout(..., 0).",
            "Starving the macrotask queue via infinite microtask recursion freezes UI rendering.",
          ],
          relevanceTag: "event_loop_concurrency",
        },
      ],
      qbankVignettes: [
        {
          id: "qbank-js-01",
          examType: "Software Architecture",
          topic: "Event Loop Scheduling & Microtask Order",
          difficulty: "hard",
          vignette:
            "Consider the following code snippet executed in a modern V8 browser environment:\n\nconsole.log('1');\nsetTimeout(() => console.log('2'), 0);\nPromise.resolve().then(() => {\n  console.log('3');\n  queueMicrotask(() => console.log('4'));\n});\nconsole.log('5');\n\nWhat is the exact printed sequence of numbers in the console?",
          options: [
            "1, 5, 2, 3, 4",
            "1, 5, 3, 4, 2",
            "1, 3, 5, 4, 2",
            "1, 5, 3, 2, 4",
          ],
          correctIndex: 1,
          distractorRationales: {
            0: "Incorrect: setTimeout enters the Macrotask queue, which cannot execute before all Microtasks are cleared.",
            1: "Correct: Synchronous logs ('1', '5') run first. Then the microtask queue processes ('3'), enqueuing another microtask ('4') which executes immediately before the event loop advances to the macrotask queue ('2').",
            2: "Incorrect: The Promise .then callback is asynchronous and cannot interleave before synchronous '5'.",
            3: "Incorrect: Macrotask '2' cannot execute before the microtask '4' that was scheduled inside '3'.",
          },
          highYieldTakeaway:
            "Microtasks (Promises, queueMicrotask) drain completely before the event loop pulls the next item from the macrotask queue.",
          sourceQBank: "Advanced ECMAScript Runtime Certification Bank",
        },
      ],
      mnemonics: [
        {
          mnemonic: "M-BEFORE-M",
          expansion: "Microtasks Before Macrotasks",
          rule: "All queued Microtasks (Promises, queueMicrotask) must drain to zero before a single Macrotask (setTimeout, I/O) executes.",
          clinicalContext: "JavaScript runtime concurrency and asynchronous scheduling.",
        },
        {
          mnemonic: "W-E-C-V",
          expansion: "Writable, Enumerable, Configurable, Value",
          rule: "The four fundamental property descriptor flags defining JavaScript object behavior and property mutability.",
          clinicalContext: "Object metaprogramming and property descriptor attributes.",
        },
      ],
      sectionSummaries: [
        "Lexical scoping, closure lifecycle, memory retention mechanics, and execution context environments.",
        "Prototypal inheritance chains, prototype delegation, and explicit property descriptor configuration.",
        "Asynchronous event loop mechanics: call stack sequencing, microtask queue priority, and Promise scheduling.",
      ],
      defaultSummary:
        "ECMAScript execution mechanics, lexical scoping, prototypal delegation chains, and asynchronous microtask event loops.",
    },
  },

  "brave-new-world": {
    id: "3",
    slug: "brave-new-world",
    title: "Brave New World",
    author: "Aldous Huxley",
    topic: "Classics",
    segments: [
      {
        title: "Chapter 1 & 2: The Hatchery, Bokanovsky's Process, and Conditioning",
        pageNumber: 1,
        content: `A squat grey building of only thirty-four storeys: the Central London Hatchery and Conditioning Centre. Over the main entrance the World State's motto: Community, Identity, Stability. Inside, the Director of Hatcheries and Conditioning leads students through the Fertilizing Room. Natural procreation is an archaic obscenity; human life is engineered mechanically via Bokanovsky's Process, arresting egg development to cause budding and yield scores of identical twins from a single ovum.\n\nFrom decanting onwards, biological predestination determines social utility. Embryos intended for lower castes—Gammas, Deltas, Epsilons—are subjected to oxygen deprivation and temperature shocks to curtail physical and intellectual capacity. In the Infant Nurseries, Neo-Pavlovian conditioning couples pleasant sensory stimuli (flowers, colourful picture books) with agonizing electric shocks and sirens. Delta infants learn instinctively to recoil from literature and botany, conditioning them solely for mechanical labor and mass consumerism.`,
      },
      {
        title: "Chapter 5 & 6: Soma, Sensory Distraction, and the Elimination of Passion",
        pageNumber: 74,
        content: `In the World State, emotional anguish and existential dread are rendered obsolete through chemical pacification. Soma—the perfect pharmacological euphoric—carries all the advantages of Christianity and alcohol without their defects: 'a gramme is better than a damn.' Whenever melancholy, frustration, or doubt threatens psychological equilibrium, a half-gramme soma holiday restores serene numbness. Solitude is actively pathologized as antisocial eccentricity; citizens are conditioned to demand perpetual collective leisure.\n\nCulture is engineered around instantaneous sensory gratification. The Feelies offer multi-sensory cinema where audiences grasp metal knobs to feel the actors' synthetic kisses and tactile collisions. Solidarity Services simulate pseudo-religious orgiastic communion, subordinating individual identity into an artificial collective ego. By eliminating suffering, romantic fidelity, familial bonds, and solitude, the state eradicates the catalysts for rebellion, trading authentic human consciousness for engineered contentment.`,
      },
      {
        title: "Chapter 16 & 17: Mustapha Mond and John the Savage: The Great Debate",
        pageNumber: 215,
        content: `In Mustapha Mond's study, the Controller confronts John the Savage in one of literature's pivotal ideological dialogues. Mond reveals that he too once pursued forbidden scientific research and read Shakespeare, but chose the sacrifice of high art and pure science for social stability. 'Universal happiness keeps the wheels steadily turning; truth and beauty can't,' Mond explains. High tragedy requires social instability, deep sorrow, and heroism—elements incompatible with a frictionless civilization.\n\nJohn passionately rejects this sterile paradise. He argues that by immunizing humanity against grief, age, illness, and despair, the World State has castrated human dignity. When Mond asserts that soma provides complete freedom from discomfort, John retorts: 'I don't want comfort. I want God, I want poetry, I want real danger, I want freedom, I want goodness. I want sin.' He claims the right to be unhappy, sick, and tormented—asserting that suffering is the indispensable prerequisite of genuine human autonomy.`,
      },
    ],
    domainContext: {
      authoritativeReferences: [
        {
          id: "ref-bnw-01",
          source: "Brave New World (Aldous Huxley)",
          edition: "Harper Perennial Classic Edition",
          type: "textbook",
          title: "Conditioning, Bokanovsky's Process, and State Stability",
          chapterOrSection: "Chapters 1, 2 & 16",
          excerpt:
            "Community, Identity, Stability. People are happy; they get what they want, and they never want what they cannot get. They're well off; they're safe; they're never ill; they're not afraid of death; they're blissfully ignorant of passion and old age.",
          clinicalPearls: [
            "Totalitarianism functions through pleasure conditioning and consumerism rather than overt terror.",
            "Eliminating psychological distress simultaneously eliminates capacity for profound aesthetic insight.",
          ],
          relevanceTag: "dystopian_biopolitics",
        },
        {
          id: "ref-postman-01",
          source: "Amusing Ourselves to Death: Public Discourse in the Age of Show Business",
          edition: "Neil Postman",
          type: "textbook",
          title: "The Huxleyan Warning vs The Orwellian Nightmare",
          chapterOrSection: "Foreword & Chapter 1",
          excerpt:
            "Orwell feared those who would deprive us of information. Huxley feared those who would give us so much that we would be reduced to passivity and egoism. Orwell feared that the truth would be concealed from us. Huxley feared the truth would be drowned in a sea of irrelevance.",
          clinicalPearls: [
            "Sensory surfeit and superficial entertainment represent potent mechanisms of epistemic pacification.",
          ],
          relevanceTag: "cultural_epistemology",
        },
      ],
      qbankVignettes: [
        {
          id: "qbank-bnw-01",
          examType: "General Clinical",
          topic: "Bioethics & Utilitarian Psychological Conditioning",
          difficulty: "hard",
          vignette:
            "A bioethicist evaluates a societal regime that uses genetic editing and pediatric neuro-conditioning to eradicate mood disorders, anxiety, and non-conformist ideation. While crime and clinical depression are reduced to zero, the population completely loses capacity for creative innovation, philosophical inquiry, and emotional vulnerability.\n\nFrom the perspective of Aldous Huxley's critique of the World State, what fundamental ethical pathology does this scenario represent?",
          options: [
            "A failure to properly balance serotonin and dopamine neurotransmitter homeostasis",
            "Instrumental rationalization replacing existential agency: sacrificing human self-determination for synthetic utilitarian stability",
            "Insufficient economic distribution of consumer resources across socioeconomic strata",
            "A breakdown of legal due process and institutional constitutional jurisprudence",
          ],
          correctIndex: 1,
          distractorRationales: {
            0: "Incorrect: The scenario explicitly achieves biological mood balance; Huxley's critique is metaphysical and philosophical, not neurochemical.",
            1: "Correct: Huxley exposes how reducing human flourishing to hedonic contentment through state-mandated biological conditioning robs individuals of autonomous consciousness, artistic depth, and genuine moral agency.",
            2: "Incorrect: The World State guarantees abundant consumption for all castes; material inequality is not the central philosophical critique.",
            3: "Incorrect: The control mechanism is psychological and biological predestination rather than standard legal enforcement.",
          },
          highYieldTakeaway:
            "True human agency requires the freedom to experience suffering, doubt, and moral choice; engineered happiness is a subtle form of totalitarian dehumanization.",
          sourceQBank: "Bioethics & Critical Philosophy Case Bank",
        },
      ],
      mnemonics: [
        {
          mnemonic: "C-I-S",
          expansion: "Community, Identity, Stability",
          rule: "The World State's cardinal triad prioritizing societal equilibrium above individual freedom and authentic emotion.",
          clinicalContext: "Sociological analysis of dystopian control mechanisms.",
        },
        {
          mnemonic: "S-O-M-A",
          expansion: "Suppression Of Melancholy & Anxiety",
          rule: "Chemical escapism substituting genuine conflict resolution with hedonic pacification.",
          clinicalContext: "Pharmacological pacification in dystopian literature.",
        },
      ],
      sectionSummaries: [
        "Biological predestination through Bokanovsky's process and Neo-Pavlovian infant nursery conditioning.",
        "Pharmacological pacification through soma, sensory cinema, and the institutionalization of collective ego.",
        "The philosophical confrontation between Mustapha Mond and John the Savage over suffering and truth.",
      ],
      defaultSummary:
        "Dystopian Bio-Engineering & Totalitarian Hedonism: the sacrifice of human autonomy, passion, and truth for synthetic societal stability.",
    },
  },

  "rich-dad-poor-dad": {
    id: "4",
    slug: "rich-dad-poor-dad",
    title: "Rich Dad Poor Dad",
    author: "Robert Kiyosaki",
    topic: "Finance",
    segments: [
      {
        title: "Lesson 1: The Rich Don't Work for Money",
        pageNumber: 18,
        content: `Most people spend their entire working lives trapped in a cycle driven by two primary emotions: fear and desire. Fear of missing bill payments, fear of losing their job, and fear of social embarrassment keep employees tethered to their cubicles. When paycheck increases arrive, desire takes over, driving higher consumer spending and lifestyle creep—a phenomenon known as the Rat Race. They mistake a high salary for financial security, failing to realize that trading hours for dollars leaves them permanently vulnerable to inflation, taxation, and corporate downsizing.\n\nRich Dad taught that the rich do not work for money; they have money work for them. Escaping the rat race requires mastering emotional intelligence: refusing to allow fear and greed to dictate financial choices. Instead of seeking wages to pay expenses, the financially intelligent focus on building systems, acquiring equity, and deploying capital into cash-flowing ventures that operate independently of personal time expenditure.`,
      },
      {
        title: "Lesson 2: Financial Literacy and the Asset vs Liability Distinction",
        pageNumber: 62,
        content: `Rule Number One in financial literacy is shockingly simple, yet understood by few: you must know the difference between an asset and a liability, and buy assets. Accounting textbooks define assets broadly, but in practical cash-flow terms: an asset is something that puts money in your pocket whether you work or not. A liability is something that takes money out of your pocket.\n\nThe middle class repeatedly mistakes major liabilities for assets—most notably, their personal residence. A primary home demands constant mortgage interest, property taxes, insurance, and maintenance, draining monthly cash flow while tying up equity that could be compounding in productive capital. The rich focus their efforts on their Asset Column: stocks, bonds, income-producing real estate, notes, and intellectual royalties. As the asset column expands, the cash flow it generates pays for luxuries and lifestyle upgrades, rather than funding them through earned wage debt.`,
      },
      {
        title: "Lesson 4 & 5: Corporations, Taxation, and Financial IQ",
        pageNumber: 135,
        content: `A comprehensive Financial IQ consists of four broad disciplines: Accounting (reading financial statements), Investing (capital allocation and market strategy), Understanding Markets (supply, demand, and economic cycles), and the Law (tax advantages and corporate protection). Employees earn income, are taxed immediately at the source via withholding, and live off what remains. In sharp contrast, corporations earn revenue, spend pre-tax dollars on legitimate business expenses, and are taxed only on the residual profit.\n\nBy operating through corporate entities, the rich harness powerful tax codes and legal shields against litigation. They defer tax burdens through depreciation schedules, 1031 exchanges, and reinvested capital. True wealth is not measured in currency balances, but in time: if you stopped working today, how many days could you survive while maintaining your current standard of living? Developing financial intelligence transforms money from an intimidating master into an obedient servant.`,
      },
    ],
    domainContext: {
      authoritativeReferences: [
        {
          id: "ref-rdpd-01",
          source: "Rich Dad Poor Dad (Robert T. Kiyosaki)",
          edition: "20th Anniversary Edition",
          type: "textbook",
          title: "Assets vs Liabilities and the Cash Flow Quadrant",
          chapterOrSection: "Lessons 2 & 3",
          excerpt:
            "Assets put money in your pocket. Liabilities take money out of your pocket. The poor and middle class acquire liabilities that they think are assets. The rich focus exclusively on acquiring income-generating assets.",
          clinicalPearls: [
            "Cash flow velocity matters more than static net worth calculations.",
            "Primary residences without tenant income function as ongoing cash-flow liabilities.",
          ],
          relevanceTag: "cash_flow_fundamentals",
        },
        {
          id: "ref-graham-01",
          source: "The Intelligent Investor (Benjamin Graham)",
          edition: "Harper Business Essentials",
          type: "textbook",
          title: "Margin of Safety and Productive Capital Allocation",
          chapterOrSection: "Chapter 20: Margin of Safety",
          excerpt:
            "An investment operation is one which, upon thorough analysis, promises safety of principal and an adequate return. Operations not meeting these requirements are speculative.",
          clinicalPearls: [
            "Distinguish between productive capital assets and non-yielding speculative holdings.",
          ],
          relevanceTag: "capital_allocation",
        },
      ],
      qbankVignettes: [
        {
          id: "qbank-rdpd-01",
          examType: "General Clinical",
          topic: "Cash Flow Mechanics & Balance Sheet Allocation",
          difficulty: "medium",
          vignette:
            "A professional earning $180,000 annually purchases a luxury home with a 30-year fixed mortgage requiring $4,800 monthly in principal, interest, taxes, and insurance. The buyer finances luxury automobiles on 5-year terms and has no dividend, rental, or business income outside their job.\n\nAccording to Robert Kiyosaki's financial literacy model, what is the fundamental structural vulnerability in this balance sheet?",
          options: [
            "The individual's credit score is insufficient to negotiate competitive borrowing rates",
            "The balance sheet is heavily weighted with liabilities masquerading as assets, creating complete dependence on continuous earned wage income to service negative cash flow",
            "The mortgage interest deduction fails to fully offset federal alternative minimum taxes",
            "The real estate market is poised for an immediate cyclical macro contraction",
          ],
          correctIndex: 1,
          distractorRationales: {
            0: "Incorrect: Credit score is a mechanical underwriting detail, not the core cash-flow flaw.",
            1: "Correct: The individual has acquired major cash-draining liabilities while possessing zero cash-generating assets, making them entirely vulnerable in the Rat Race.",
            2: "Incorrect: Tax deductions do not compensate for massive net negative monthly cash outflows.",
            3: "Incorrect: The fundamental issue exists independent of external market speculation.",
          },
          highYieldTakeaway:
            "True financial independence requires building an asset column of cash-flowing investments that exceed monthly living liabilities.",
          sourceQBank: "Financial Literacy & Capital Allocation Bank",
        },
      ],
      mnemonics: [
        {
          mnemonic: "E-S-B-I",
          expansion: "Employee, Self-employed, Business owner, Investor",
          rule: "Transition from the active-labor left side (E, S) to the scalable, capital-generating right side (B, I).",
          clinicalContext: "Cash Flow Quadrant capital allocation strategies.",
        },
        {
          mnemonic: "C-A-S-H",
          expansion: "Capital Acquisition, Sustainable Cashflow, Halted Liabilities",
          rule: "Prioritize acquiring yielding capital assets before taking on depreciating personal liabilities.",
          clinicalContext: "Personal balance sheet management.",
        },
      ],
      sectionSummaries: [
        "Breaking free from the emotional trap of fear and desire: making money work for you rather than trading hours for wages.",
        "The foundational balance sheet rule: understanding genuine assets that produce cash versus liabilities that consume it.",
        "Leveraging financial intelligence, corporate entities, and tax-advantaged structures to protect and compound capital.",
      ],
      defaultSummary:
        "Personal Finance & Balance Sheet Mechanics: acquiring income-generating assets, mastering tax advantages, and escaping the wage-dependent rat race.",
    },
  },

  "deep-work": {
    id: "5",
    slug: "deep-work",
    title: "Deep Work",
    author: "Cal Newport",
    topic: "Productivity",
    segments: [
      {
        title: "Part 1: The Deep Work Hypothesis and High-Value Skill Acquisition",
        pageNumber: 24,
        content: `Deep Work refers to professional activities performed in a state of distraction-free concentration that push your cognitive capabilities to their limit. These efforts create new value, improve your skill, and are hard to replicate. In contrast, shallow work consists of non-cognitively demanding, logistical tasks, often performed while distracted. In an economy increasingly dominated by automation and artificial intelligence, two abilities are vital: the ability to quickly master hard things, and the ability to produce at an elite level, in terms of both quality and speed.\n\nBoth abilities depend upon deep focus. Learning complex skills requires deliberate practice—which modern neuroscience links to myelination. When you concentrate intensely on a specific skill, you trigger oligodendrocyte cells to wrap layers of myelin around the relevant neural circuits, cementing the pathway and allowing firing with less energy and greater speed. If you attempt to learn while multitasking, you fire fragmented circuits, inhibiting effective myelination. High-Quality Work Produced = (Time Spent) x (Intensity of Focus).`,
      },
      {
        title: "Part 2, Rule 1 & 2: Four Scheduling Philosophies and Embracing Boredom",
        pageNumber: 102,
        content: `To integrate deep work into professional life, individuals must adopt an explicit scheduling philosophy. The Monastic philosophy eliminates or radically minimizes shallow obligations (typified by Donald Knuth abandoning email). The Bimodal philosophy divides time into distinct, long intervals of monastic focus alternating with open logistical availability (Carl Jung retreating to his Bollingen Tower). The Rhythmic philosophy transforms deep work into a daily habit at set hours. The Journalistic philosophy involves shifting into deep work mode whenever a free hour appears—a demanding method reserved for experienced practitioners.\n\nDeep work is impossible if your brain is addicted to constant novelty. If every mundane moment of boredom—standing in an elevator, waiting in line—is soothed with a smartphone glance, your brain becomes conditioned to seek instant stimulation. You must embrace boredom. Schedule your internet blocks in advance rather than scheduling breaks from distraction. Train your working memory and attentional muscle through productive meditation: focusing your mind on a single, well-defined problem while walking or exercising.`,
      },
      {
        title: "Part 2, Rule 3 & 4: Draining the Shallows and Attention Residue",
        pageNumber: 184,
        content: `When you switch from Task A to Task B, your attention does not immediately follow. A portion of your cognitive capacity remains stuck thinking about the previous task—a phenomenon psychologist Sophie Leroy termed 'Attention Residue.' Even a brief 30-second check of your email inbox leaves severe residue, degrading your performance on the cognitively demanding task that follows. Minimizing task switches is therefore essential for cognitive output.\n\nDrain the shallows through rigorous boundary enforcement. Adopt the Craftsman Approach to tool selection: adopt a digital tool only if its positive impacts substantially outweigh its negative consequences, rejecting the 'any-benefit' rationalization. Implement Fixed-Schedule Productivity: set a firm limit on your workday (such as 5:30 PM), working backwards to ruthlessly eliminate low-value meetings, trivial communications, and non-essential paperwork. Enforce an evening shutdown ritual to completely decouple cognitive attention from professional concerns.`,
      },
    ],
    domainContext: {
      authoritativeReferences: [
        {
          id: "ref-deep-work-01",
          source: "Deep Work: Rules for Focused Success in a Distracted World (Cal Newport)",
          edition: "1st Edition",
          type: "textbook",
          title: "The Deep Work Hypothesis & Attention Residue",
          chapterOrSection: "Chapters 1 & 3",
          excerpt:
            "To produce at your peak level you need to work for extended periods with full concentration on a single task free from distraction. People experiencing attention residue after quick task switches perform significantly worse on subsequent cognitive challenges.",
          clinicalPearls: [
            "Attention residue impairs executive function even when switches last only seconds.",
            "Deliberate practice accelerates neuroplastic myelination along specific cognitive pathways.",
          ],
          relevanceTag: "cognitive_productivity",
        },
        {
          id: "ref-flow-01",
          source: "Flow: The Psychology of Optimal Experience (Mihaly Csikszentmihalyi)",
          edition: "Harper Perennial",
          type: "textbook",
          title: "Autotelic Focus and the Conditions of Flow",
          chapterOrSection: "Chapter 4: The Conditions of Flow",
          excerpt:
            "Optimal experience occurs when psychological energy (attention) is invested in realistic goals, and when skills match the challenges of the action. Concentration is so intense that there is no attention left over to think about anything irrelevant.",
          clinicalPearls: [
            "Cognitive flow states require an exact equilibrium between challenge and individual capability.",
          ],
          relevanceTag: "flow_psychology",
        },
      ],
      qbankVignettes: [
        {
          id: "qbank-deep-work-01",
          examType: "General Clinical",
          topic: "Attention Residue & Cognitive Workflow Design",
          difficulty: "hard",
          vignette:
            "A senior software engineer working on high-concurrency distributed algorithms keeps their corporate Slack client open across dual monitors, glancing at notifications every 4 to 8 minutes while coding. Although total working hours exceed 50 per week, the engineer suffers from chronic mental fatigue, high defect rates, and inability to resolve subtle race condition bugs.\n\nAccording to cognitive psychology and Cal Newport's Deep Work hypothesis, what mechanism explains this performance deficit?",
          options: [
            "Inadequate working memory capacity inherited through genetic predisposition",
            "Chronic attention residue: frequent brief context shifts leave neural activation fragments tethered to past interruptions, preventing full executive cognitive engagement",
            "Sub-optimal monitor refresh rate and ergonomics causing eye strain and diminished visual processing",
            "Exceeding the theoretical daily maximum limit of caloric brain glucose consumption",
          ],
          correctIndex: 1,
          distractorRationales: {
            0: "Incorrect: The deficit is caused by environmental distraction and context switching, not static genetic memory limits.",
            1: "Correct: Continuous context-switching induces severe attention residue, fracturing executive focus and degrading deep analytical reasoning.",
            2: "Incorrect: Ergonomic fatigue does not explain high defect density in algorithmic reasoning.",
            3: "Incorrect: Caloric consumption is not the primary driver of task-switching impairment.",
          },
          highYieldTakeaway:
            "Frequent context switching leaves persistent attention residue, crippling complex cognitive performance regardless of total hours worked.",
          sourceQBank: "Cognitive Performance & Systems Architecture Bank",
        },
      ],
      mnemonics: [
        {
          mnemonic: "D-E-E-P",
          expansion:
            "Deliberate practice, Elimination of distractions, Execution metrics, Protected shutdowns",
          rule: "The foundational framework for structuring high-intensity cognitive output.",
          clinicalContext: "High-performance cognitive workflow engineering.",
        },
        {
          mnemonic: "B-M-R-J",
          expansion: "Bimodal, Monastic, Rhythmic, Journalistic",
          rule: "The four scheduling philosophies for integrating deep work into modern professional life.",
          clinicalContext: "Productivity scheduling and calendar architecture.",
        },
      ],
      sectionSummaries: [
        "The deep work hypothesis: deliberate myelination, acquiring difficult skills, and high-intensity cognitive focus.",
        "Scheduling philosophies (Monastic, Bimodal, Rhythmic, Journalistic) and training the mind by embracing boredom.",
        "Eliminating attention residue, rejecting shallow communication, and implementing fixed-schedule shutdown rituals.",
      ],
      defaultSummary:
        "Attention Economics & Cognitive Psychology: deliberate practice, attention residue mitigation, and distraction-free cognitive performance.",
    },
  },

  "how-to-win-friends-and-influence-people": {
    id: "6",
    slug: "how-to-win-friends-and-influence-people",
    title: "How to Win Friends and Influence People",
    author: "Dale Carnegie",
    topic: "Classics",
    segments: [
      {
        title: "Part 1: Fundamental Techniques in Handling People",
        pageNumber: 15,
        content: `Criticism is futile because it puts a person on the defensive and usually makes them strive to justify themselves. Criticism is dangerous because it wounds a person's precious pride, hurts their sense of importance, and arouses resentment. When dealing with people, remember that you are not dealing with creatures of logic, but creatures of emotion—creatures bristling with prejudices and motivated by pride and vanity.\n\nPrinciple 1: Don't criticize, condemn, or complain. Any fool can criticize, condemn, and complain—and most fools do. But it takes character and self-control to be understanding and forgiving. Principle 2: Give honest and sincere appreciation. The deepest urge in human nature, as John Dewey observed, is 'the desire to be important.' Sincere appreciation nourishes the human spirit; flattery, on the other hand, is cheap, shallow, and selfish, immediately detected as false. Principle 3: Arouse in the other person an eager want. The only way on earth to influence other people is to talk about what they want and show them how to get it.`,
      },
      {
        title: "Part 2: Six Ways to Make People Like You",
        pageNumber: 68,
        content: `You can make more friends in two months by becoming interested in other people than you can in two years by trying to get other people interested in you. Principle 1: Become genuinely interested in other people. People are not interested in you; they are interested in themselves—morning, noon, and after dinner. A genuine smile says: 'I like you. You make me happy. I am glad to see you.'\n\nPrinciple 3: Remember that a person's name is to that person the sweetest and most important sound in any language. Remembering and respecting a person's name is an effortless compliment that elevates their dignity. Principle 4: Be a good listener; encourage others to talk about themselves. Exclusive attention to the person who is speaking to you is the highest flattery. Principle 5: Talk in terms of the other person's interests. Principle 6: Make the other person feel important—and do it sincerely.`,
      },
      {
        title: "Part 3: How to Win People to Your Way of Thinking",
        pageNumber: 130,
        content: `The only way to get the best of an argument is to avoid it. You cannot win an argument: if you lose it, you lose it; and if you win it, you make the other person feel inferior, hurt their pride, and breed resentment. A man convinced against his will is of the same opinion still. Show respect for the other person's opinions; never say 'You're wrong.' If you are wrong, admit it quickly and emphatically.\n\nBegin in a friendly way. Get the other person saying 'Yes, yes' immediately; this Socratic technique keeps the psychological door open. Let the other person do a great deal of the talking. Let the other person feel that the idea is theirs. Try honestly to see things from the other person's point of view: ask yourself, 'Why would they want to do this?' Be sympathetic with the other person's ideas and desires. Appeal to the nobler motives: people usually have two reasons for doing something—one that sounds good, and that real one.`,
      },
    ],
    domainContext: {
      authoritativeReferences: [
        {
          id: "ref-carnegie-01",
          source: "How to Win Friends and Influence People (Dale Carnegie)",
          edition: "Simon & Schuster Classic",
          type: "textbook",
          title: "Techniques in Interpersonal Influence and Rapport",
          chapterOrSection: "Parts 1, 2 & 3",
          excerpt:
            "If you want to gather honey, don't kick over the beehive. The deepest principle in human nature is the craving to be appreciated. Talk to someone about themselves and they will listen for hours.",
          clinicalPearls: [
            "Criticism activates defensive ego preservation rather than behavioral change.",
            "Validating the other person's need for importance creates collaborative goodwill.",
          ],
          relevanceTag: "interpersonal_psychology",
        },
        {
          id: "ref-cialdini-01",
          source: "Influence: The Psychology of Persuasion (Robert B. Cialdini)",
          edition: "Expanded Edition",
          type: "textbook",
          title: "Liking, Reciprocity, and Social Proof",
          chapterOrSection: "Chapters 2 & 5",
          excerpt:
            "We prefer to say yes to the requests of someone we know and like. Genuine compliments, shared identity, and cooperative endeavors reliably trigger the liking heuristic in interpersonal negotiations.",
          clinicalPearls: [
            "Reciprocal appreciation establishes trust before substantive negotiation begins.",
          ],
          relevanceTag: "persuasion_dynamics",
        },
      ],
      qbankVignettes: [
        {
          id: "qbank-carnegie-01",
          examType: "General Clinical",
          topic: "Conflict De-escalation & Persuasive Communication",
          difficulty: "medium",
          vignette:
            "During a heated cross-functional product roadmap meeting, a senior architect loudly declares that a marketing director's proposed launch schedule is 'technically impossible, reckless, and completely ignorant of database constraints.' The marketing director crosses their arms and refuses further collaboration.\n\nAccording to Dale Carnegie's principles of human relations, how should the architect reframe this dialogue to resolve the impasse?",
          options: [
            "Present a 40-slide presentation demonstrating the exact mathematical impossibility of the schedule to settle the debate through cold logic",
            "Acknowledge the marketing director's ambition, apologize for the blunt dismissal, ask probing questions to understand their strategic launch goals, and co-design a phased rollout",
            "Escalate the dispute to the Chief Technology Officer to enforce technical veto authority over marketing",
            "Remain silent and allow the marketing team to miss the deadline so they learn through experience",
          ],
          correctIndex: 1,
          distractorRationales: {
            0: "Incorrect: Overwhelming with data after wounding their pride intensifies defensive hostility; 'a man convinced against his will is of the same opinion still.'",
            1: "Correct: Validating their goals, admitting fault quickly, and seeing things from their perspective de-escalates conflict and fosters cooperative alignment.",
            2: "Incorrect: Authority-based veto breeds resentment and poisons long-term interdepartmental trust.",
            3: "Incorrect: Passive-aggressive non-cooperation harms the entire organization.",
          },
          highYieldTakeaway:
            "Never attack the other person's pride or declare them wrong; avoid argument, listen empathetically, and appeal to shared noble goals.",
          sourceQBank: "Executive Leadership & Human Relations Bank",
        },
      ],
      mnemonics: [
        {
          mnemonic: "H-E-A-R",
          expansion:
            "Honest appreciation, Eliminate criticism, Arouse eager want, Remember names",
          rule: "The foundational four-part baseline for entering any interpersonal engagement.",
          clinicalContext: "Interpersonal communication and empathetic rapport building.",
        },
        {
          mnemonic: "S-M-I-L-E",
          expansion:
            "Sincere warmth, Match interests, Inquire actively, Listen deeply, Elevate others",
          rule: "The practical behavioral sequence to disarm defensiveness and build authentic relationships.",
          clinicalContext: "Stakeholder negotiation and conflict de-escalation.",
        },
      ],
      sectionSummaries: [
        "Abandoning criticism and blame: satisfying the fundamental human hunger for sincere appreciation and importance.",
        "Six habits of authentic charisma: genuine interest, active listening, remembering names, and smiling.",
        "Winning agreement without hostility: avoiding arguments, admitting errors swiftly, and letting others feel ownership of ideas.",
      ],
      defaultSummary:
        "Interpersonal Psychology & Persuasion Dynamics: empathetic listening, validating personal dignity, and disarming defensive conflict.",
    },
  },

  "the-power-of-habit": {
    id: "7",
    slug: "the-power-of-habit",
    title: "The Power of Habit",
    author: "Charles Duhigg",
    topic: "Psychology",
    segments: [
      {
        title: "Part 1: The Habit Loop and the Basal Ganglia Mechanism",
        pageNumber: 12,
        content: `At the core of human behavioral automaticity sits the basal ganglia, an ancient, walnut-sized cluster of tissue near the center of the brain. When animal subjects navigate a maze for the first time, their prefrontal cortex works furiously, processing every scent and barrier. As the route becomes familiar, mental activity plummets. The brain converts a sequence of actions into an automatic routine—a neurological process known as 'chunking.' Chunking allows the brain to conserve precious mental energy for unforeseen emergencies.\n\nEvery habit follows a neurological loop consisting of three components: the Cue, the Routine, and the Reward. The Cue is a trigger that tells your brain to go into automatic mode and which habit to use. The Routine is the physical, mental, or emotional behavior itself. The Reward helps your brain figure out if this particular loop is worth remembering for the future. Over time, this loop becomes increasingly automatic until a powerful craving emerges, binding cue to reward.`,
      },
      {
        title: "Part 1, Chapter 2 & 3: The Golden Rule of Habit Change and Craving",
        pageNumber: 64,
        content: `You cannot extinguish an established habit; you can only change it. This is the Golden Rule of habit change: if you use the same cue and provide the same reward, you can shift the routine and change the habit. Almost any behavior can be transformed if the cue and reward remain consistent. For instance, an individual who snacks at 3:00 PM every afternoon may discover their cue is actually boredom and a desire for social connection, rather than biological hunger. Replacing the snack routine with a brief stroll to chat with a colleague satisfies the identical reward without caloric cost.\n\nHabits are powered by anticipatory cravings. Wolfram Schultz's neuroimaging studies on primates demonstrated that once a habit loop solidifies, dopamine spikes upon perception of the cue—before the reward is received. If the reward fails to materialize, the brain experiences an intense crash of distress and frustration. To reprogram compulsive patterns, one must identify the precise craving driving the loop. Furthermore, during times of acute crisis, sustainable habit transformation requires belief, which is vastly magnified within a supportive community.`,
      },
      {
        title: "Part 2, Chapter 4: Keystone Habits and Organizational Transformation",
        pageNumber: 132,
        content: `Some habits possess the power to start a chain reaction, shifting other habits as they ripple through an organization. These are known as 'Keystone Habits.' Keystone habits alter our sense of identity and what is possible by creating small wins. Small wins fuel transformative change by convincing people that larger achievements are within reach.\n\nWhen Paul O'Neill took over the struggling industrial giant Alcoa in 1987, Wall Street expected financial restructuring. Instead, O'Neill announced a single priority: zero workplace injuries. By attacking safety, he forced union leaders, factory supervisors, and corporate executives to communicate transparently, eliminating departmental fiefdoms and redesigning dangerous manufacturing processes. The result: worker safety soared, operational defects plummeted, and Alcoa's net income increased fivefold. By transforming a keystone habit, an entire corporate culture was reborn.`,
      },
    ],
    domainContext: {
      authoritativeReferences: [
        {
          id: "ref-power-habit-01",
          source: "The Power of Habit: Why We Do What We Do in Life and Business (Charles Duhigg)",
          edition: "Random House",
          type: "textbook",
          title: "The Neurological Habit Loop and Basal Ganglia Encoding",
          chapterOrSection: "Chapters 1, 2 & 4",
          excerpt:
            "Habits emerge because the brain is constantly looking for ways to save effort. Left to its own devices, the brain will try to make almost any routine into a habit, because habits allow our minds to ramp down more frequently.",
          clinicalPearls: [
            "The basal ganglia chunk complex action sequences to preserve prefrontal cortex reserves.",
            "The Golden Rule: keep the cue and reward constant while substituting the intervening routine.",
          ],
          relevanceTag: "habit_neurobiology",
        },
        {
          id: "ref-kandel-neuro-01",
          source: "Principles of Neural Science (Kandel, Schwartz, Jessell)",
          edition: "5th Edition",
          type: "textbook",
          title: "Striatal Circuitry and Procedural Memory",
          chapterOrSection: "Chapter 43: The Basal Ganglia",
          excerpt:
            "Dopaminergic signaling from the substantia nigra pars compacta to the striatum regulates reinforcement learning. Anticipatory dopamine surges encode reward prediction error rather than consummatory pleasure.",
          clinicalPearls: [
            "Dopaminergic craving occurs in response to conditioned cues prior to reward delivery.",
          ],
          relevanceTag: "neuroplasticity_striatum",
        },
      ],
      qbankVignettes: [
        {
          id: "qbank-habit-01",
          examType: "General Clinical",
          topic: "Basal Ganglia Neuroplasticity & Habit Substitution",
          difficulty: "hard",
          vignette:
            "A corporate executive reports smoking cigarettes during high-pressure board negotiations. Functional behavioral analysis indicates the cue is acute cognitive stress and the reward is a brief respiratory pause coupled with sympathetic nervous system regulation. The patient has tried cold turkey cessation multiple times, relapsing within two weeks.\n\nApplying the Golden Rule of Habit Change, what intervention provides the highest probability of permanent behavioral modification?",
          options: [
            "Imposing punitive financial penalties each time a cigarette is purchased",
            "Retaining the stress cue and the relaxation reward, but substituting the cigarette with a 3-minute diaphragmatic breathing protocol outside the room",
            "Avoiding all high-pressure negotiations to permanently remove the environmental cue",
            "Using willpower to resist the urge whenever the cue presents itself",
          ],
          correctIndex: 1,
          distractorRationales: {
            0: "Incorrect: Punitive penalties fail to satisfy the underlying neurological craving, leading to inevitable relapse.",
            1: "Correct: The Golden Rule states that habits cannot be extinguished, only rewritten: maintaining the identical cue (stress) and reward (calm pause) while swapping the routine (breathing exercise) achieves lasting behavioral remodeling.",
            2: "Incorrect: Eliminating executive duties is unrealistic and fails to retrain the basal ganglia.",
            3: "Incorrect: Willpower is a depletable prefrontal resource that collapses under stress.",
          },
          highYieldTakeaway:
            "Lasting habit modification requires preserving the cue and the reward while substituting a constructive routine.",
          sourceQBank: "Behavioral Medicine & Neurobiology QBank",
        },
      ],
      mnemonics: [
        {
          mnemonic: "C-R-R",
          expansion: "Cue, Routine, Reward",
          rule: "The three invariant stages of every neurological habit loop encoded in the basal ganglia.",
          clinicalContext: "Neurobiology of habit formation and behavioral automaticity.",
        },
        {
          mnemonic: "K-E-Y",
          expansion: "Keystone habits Establish Yields",
          rule: "Identify and target keystone habits that naturally cascade small wins across adjacent systems.",
          clinicalContext: "Organizational behavior and systemic habit transformation.",
        },
      ],
      sectionSummaries: [
        "The neurology of automaticity: basal ganglia chunking and the tripartite loop of Cue, Routine, and Reward.",
        "The Golden Rule of habit change: preserving cues and rewards while redirecting routines via anticipatory craving awareness.",
        "Keystone habits and systemic culture: how small wins ignite organizational transformation.",
      ],
      defaultSummary:
        "Neurobiology of Habit Loops & Behavioral Conditioning: striatal chunking, dopaminergic craving, and keystone habit cascades.",
    },
  },

  "atomic-habits": {
    id: "8",
    slug: "atomic-habits",
    title: "Atomic Habits",
    author: "James Clear",
    topic: "Productivity",
    segments: [
      {
        title: "Fundamentals: The Aggregation of Marginal Gains and Identity-Based Habits",
        pageNumber: 16,
        content: `It is so easy to overestimate the importance of one defining moment and underestimate the value of making small improvements on a daily basis. If you can get 1 percent better each day for one year, you'll end up thirty-seven times better by the time you're done (1.01^365 = 37.78). Conversely, if you get 1 percent worse each day for one year, you'll decline nearly down to zero. Habits are the compound interest of self-improvement.\n\nTrue behavioral transformation is not outcome-based; it is identity-based. Most people attempt change by focusing on what they want to achieve (outcomes). A better approach focuses on who they wish to become (identity). The goal is not to read a book, the goal is to become a reader. The goal is not to run a marathon, the goal is to become a runner. Every action you take is a vote for the type of person you wish to be. No single instance will transform your beliefs, but as the votes build up, the evidence of your new identity becomes undeniable.`,
      },
      {
        title: "The 1st & 2nd Laws: Make It Obvious and Make It Attractive",
        pageNumber: 72,
        content: `The First Law of behavior change is to Make It Obvious. Do not rely on vague aspirations; use Implementation Intentions: 'I will [BEHAVIOR] at [TIME] in [LOCATION].' Combine this with Habit Stacking: link a new habit with an existing cue: 'After [CURRENT HABIT], I will [NEW HABIT].' Environment is the invisible hand that shapes human behavior. We often choose products not because of what they are, but because of where they are. Become the architect of your environment: place constructive cues front and center, while banishing cues for undesirable habits from sight.\n\nThe Second Law is to Make It Attractive. Habits are dopamine-driven feedback loops. When dopamine rises, so does our motivation to act. Temptation Bundling pairs an action you need to do with an action you want to do. Furthermore, humans are profoundly influenced by social norms: join a culture where your desired behavior is the normal behavior, and where you already have something in common with the group.`,
      },
      {
        title: "The 3rd & 4th Laws: Make It Easy and Make It Satisfying",
        pageNumber: 154,
        content: `The Third Law is to Make It Easy. Human behavior follows the Law of Least Effort: we naturally gravitate toward the option that requires the least amount of work. Reduce friction associated with good habits (prepare workout clothes the night before), and increase friction for bad habits (unplug the television and place the remote in another room). Master the Two-Minute Rule: when you start a new habit, it should take less than two minutes to do. Optimize for starting: ritualize the beginning so that momentum carries you forward.\n\nThe Fourth Law is to Make It Satisfying. What is immediately rewarded is repeated; what is immediately punished is avoided. The human brain evolved in an immediate-return environment, whereas modern society operates on delayed rewards. Use immediate reinforcement: employ habit trackers to make progress visually tangible ('Don't break the chain'). Never miss twice: if you miss a day due to unavoidable circumstances, bounce back immediately on the next day.`,
      },
    ],
    domainContext: {
      authoritativeReferences: [
        {
          id: "ref-atomic-habits-01",
          source: "Atomic Habits: An Easy & Proven Way to Build Good Habits & Break Bad Ones (James Clear)",
          edition: "Avery / Penguin Random House",
          type: "textbook",
          title: "The Four Laws of Behavior Change and Identity Compounding",
          chapterOrSection: "Chapters 1, 2 & The Four Laws",
          excerpt:
            "You do not rise to the level of your goals. You fall to the level of your systems. Small habits don't add up; they compound. Changes that seem small and unimportant at first will compound into remarkable results if you're willing to stick with them for years.",
          clinicalPearls: [
            "Identity-based habits anchor long-term compliance more sustainably than goal-based targets.",
            "The Four Laws (Obvious, Attractive, Easy, Satisfying) systematize behavioral engineering.",
          ],
          relevanceTag: "behavioral_compounding",
        },
        {
          id: "ref-thaler-nudge-01",
          source: "Nudge: Improving Decisions About Health, Wealth, and Happiness",
          edition: "Thaler & Sunstein (Yale University Press)",
          type: "textbook",
          title: "Choice Architecture and Default Opt-Ins",
          chapterOrSection: "Chapter 1: Biases and Blunders",
          excerpt:
            "A choice architect has the responsibility for organizing the context in which people make decisions. By altering friction and visibility without forbidding any choices, one can predictably guide human behavior.",
          clinicalPearls: [
            "Altering environmental defaults reliably outperforms appeals to willpower.",
          ],
          relevanceTag: "choice_architecture",
        },
      ],
      qbankVignettes: [
        {
          id: "qbank-atomic-01",
          examType: "General Clinical",
          topic: "Choice Architecture & Implementation Intentions in Behavioral Change",
          difficulty: "hard",
          vignette:
            "A patient with pre-diabetes has repeatedly failed to maintain a 30-minute daily exercise routine, citing mental resistance after long work shifts. The patient resolves to 'try harder with stronger willpower.'\n\nApplying James Clear's Third Law (Make It Easy) and behavioral choice architecture, which intervention should be recommended first?",
          options: [
            "Contracting for an annual ultra-marathon to establish an ambitious long-term goal",
            "Implementing the Two-Minute Rule: scaling down the target to putting on running shoes and walking out the front door for two minutes daily to master the art of showing up",
            "Purchasing expensive biometric monitoring watches to introduce monetary guilt incentives",
            "Relying on daily motivational audiobooks during commutes to elevate baseline dopamine levels",
          ],
          correctIndex: 1,
          distractorRationales: {
            0: "Incorrect: Intimidating goals drastically increase friction, ensuring paralysis and early abandonment.",
            1: "Correct: The Two-Minute Rule drastically lowers initial activation energy, establishing the behavioral gateway routine before scaling complexity.",
            2: "Incorrect: Guilt is an unstable motivator that does not reduce behavioral friction.",
            3: "Incorrect: Passive motivation dissipates rapidly when acute fatigue strikes.",
          },
          highYieldTakeaway:
            "Standardize before you optimize; make the habit entry point take less than two minutes to conquer initial friction.",
          sourceQBank: "Behavioral Economics & Preventive Medicine Bank",
        },
      ],
      mnemonics: [
        {
          mnemonic: "O-A-E-S",
          expansion: "Obvious, Attractive, Easy, Satisfying",
          rule: "The Four Laws of Behavior Change for instilling constructive, resilient habits.",
          clinicalContext: "Applied behavioral economics and choice architecture.",
        },
        {
          mnemonic: "I-U-D-U",
          expansion: "Invisible, Unattractive, Difficult, Unsatisfying",
          rule: "The inversion of the Four Laws deployed to dismantle destructive or compulsive habits.",
          clinicalContext: "Addiction modification and bad habit deconstruction.",
        },
      ],
      sectionSummaries: [
        "The mathematical compounding of 1% daily improvements and shifting from outcome goals to identity-based habits.",
        "The 1st & 2nd Laws: making cues obvious via implementation intentions and making routines attractive with temptation bundling.",
        "The 3rd & 4th Laws: eliminating friction with the Two-Minute Rule and locking in repetition through immediate satisfaction.",
      ],
      defaultSummary:
        "Habit Loops & Behavioral Economics: 1% compounding, identity-based reinforcement, choice architecture, and the Four Laws of Behavior Change.",
    },
  },

  "the-courage-to-be-disliked": {
    id: "9",
    slug: "the-courage-to-be-disliked",
    title: "The Courage to Be Disliked",
    author: "Fumitake Koga & Ichiro Kishimi",
    topic: "Philosophy",
    segments: [
      {
        title: "First Night: Deny Trauma — Teleology Over Freudian Etiology",
        pageNumber: 22,
        content: `In the quiet study of an Adlerian philosopher, a dissatisfied youth arrives to challenge the claim that the world is simple and anyone can be happy right now. The philosopher immediately targets the foundation of modern psychotherapy: Sigmund Freud's etiology. Etiology insists that our present state is determined entirely by past causes and childhood trauma. If past causes determine our present, we are trapped in fatalistic determinism with no agency.\n\nAlfred Adler's Individual Psychology introduces Teleology: the study of purpose. We do not act because of past causes; we act to achieve present purposes. Adler taught: 'No experience is in itself a cause of our success or failure. We do not suffer from the shock of our experiences—the so-called trauma—but instead we make out of them whatever suits our purposes.' A person who shuts themselves in their room does not do so because past bullying forces them to; they do so to achieve the purpose of remaining safe, eliciting parental worry, and avoiding the risk of interpersonal failure in the outside world.`,
      },
      {
        title: "Third Night: Discard Other People's Tasks — The Separation of Tasks",
        pageNumber: 94,
        content: `All interpersonal relationship troubles arise from intruding on other people's tasks, or having one's own tasks intruded upon. To establish harmony, we must rigorously practice the Separation of Tasks. When facing any situation, ask: 'Whose task is this ultimately?' Who will receive the end result of the choice made? For example, whether a child studies is ultimately the child's task, not the parent's. A parent can encourage, provide resources, and be available, but forcing the child to study is an arrogant intrusion that damages relationship bonds.\n\nFurthermore, seeking approval from others is living someone else's life. If you live to satisfy the expectations of others, you surrender your freedom. Freedom is having the courage to be disliked. Being disliked by others is proof that you are exercising your autonomy and living freely according to your own principles. You cannot control what other people think of you—that is their task. Your task is to choose the best path you believe in.`,
      },
      {
        title: "Fourth & Fifth Nights: Community Feeling and Living in the Here and Now",
        pageNumber: 188,
        content: `The ultimate destination of Adlerian psychology is Community Feeling (Gemeinschaftsgefühl)—viewing others not as competitors to defeat, but as comrades in a shared community. This requires abandoning vertical relationships (hierarchies based on praise and rebuke) in favor of horizontal relationships (treating everyone as equals with different roles). Praising another person implies a hierarchy of judgment ('the capable judging the incapable'). Instead, express gratitude: 'Thank you,' which bolsters the recipient's sense of contribution.\n\nCommunity feeling consists of three pillars: Self-Acceptance (accepting one's imperfect self), Confidence in Others (believing in others unconditionally without collateral), and Contribution to Others (feeling useful without demanding recognition). Life is not a dramatic straight line running from past to future; it is a series of moments called 'now.' Live intensely in the present moment, like dancing. The meaning of life is not something bestowed upon you—it is something you bestow upon yourself.`,
      },
    ],
    domainContext: {
      authoritativeReferences: [
        {
          id: "ref-courage-disliked-01",
          source: "The Courage to Be Disliked (Ichiro Kishimi & Fumitake Koga)",
          edition: "Atria Books",
          type: "textbook",
          title: "Adlerian Teleology and the Separation of Tasks",
          chapterOrSection: "Nights 1, 3 & 4",
          excerpt:
            "Do not live to satisfy the expectations of others. The separation of tasks is the starting point of interpersonal relations. Freedom is being disliked by other people.",
          clinicalPearls: [
            "Teleological framing restores personal agency by analyzing present purposes rather than past trauma.",
            "The Separation of Tasks prevents boundary intrusion and codependent anxiety.",
          ],
          relevanceTag: "adlerian_psychology",
        },
        {
          id: "ref-adler-human-nature-01",
          source: "Understanding Human Nature (Alfred Adler)",
          edition: "Martino Fine Books",
          type: "textbook",
          title: "Inferiority Feelings, Striving for Superiority, and Social Interest",
          chapterOrSection: "Chapter 5: The Feeling of Inferiority and the Striving for Recognition",
          excerpt:
            "We must transform the feeling of inferiority into a constructive striving for improvement, rooted in Gemeinschaftsgefühl—the feeling of human solidarity and communal contribution.",
          clinicalPearls: [
            "Authentic self-worth derives from subjective contribution to the community, not external accolades.",
          ],
          relevanceTag: "teleological_existentialism",
        },
      ],
      qbankVignettes: [
        {
          id: "qbank-courage-01",
          examType: "General Clinical",
          topic: "Adlerian Separation of Tasks in Interpersonal Stress Management",
          difficulty: "hard",
          vignette:
            "A 32-year-old manager suffers severe insomnia and panic attacks because an underperforming team member repeatedly ignores constructive advice and misses deadlines. The manager feels personally responsible for the employee's career trajectory and works overtime to secretly redo the employee's deliverables to protect them from senior leadership's reprimands.\n\nApplying Alfred Adler's principle of the Separation of Tasks, what is the core therapeutic insight for this manager?",
          options: [
            "The manager must adopt authoritarian punitive measures to enforce behavioral compliance",
            "The employee's performance and eventual career consequences are the employee's task; by intervening and doing their work, the manager is intruding on their task and depriving them of growth",
            "The manager should resign immediately to protect their own biological sleep architecture",
            "The manager must accept that past childhood parental expectations are the deterministic cause of current perfectionism",
          ],
          correctIndex: 1,
          distractorRationales: {
            0: "Incorrect: Vertical power enforcement breeds conflict and violates Adlerian horizontal respect.",
            1: "Correct: The manager has crossed boundaries, claiming ownership of another person's task. Restoring boundary separation liberates the manager from unmanageable guilt.",
            2: "Incorrect: Resignation avoids the underlying boundary confusion without resolving it.",
            3: "Incorrect: Adler explicitly denies Freudian deterministic etiology in favor of teleological purpose.",
          },
          highYieldTakeaway:
            "Separate tasks by asking who bears the ultimate consequence of an action; do not intrude on tasks that do not belong to you.",
          sourceQBank: "Adlerian Clinical Philosophy & Psychotherapy Bank",
        },
      ],
      mnemonics: [
        {
          mnemonic: "T-A-S-K",
          expansion:
            "Target boundary, Assess ownership, Separate outcomes, Keep independence",
          rule: "Identify whose task an issue is and refuse to intrude on or assume another's responsibility.",
          clinicalContext: "Interpersonal boundary negotiation and Adlerian psychology.",
        },
        {
          mnemonic: "S-C-C",
          expansion:
            "Self-Acceptance, Confidence in Others, Contribution to Others",
          rule: "The three pillars supporting genuine Community Feeling (Gemeinschaftsgefühl).",
          clinicalContext: "Adlerian mental wellness and community feeling.",
        },
      ],
      sectionSummaries: [
        "Adlerian teleology over Freudian etiology: rejecting past trauma to claim personal purpose and present freedom.",
        "The separation of tasks: identifying task ownership and developing the courage to be disliked.",
        "Horizontal relationships, community feeling (Gemeinschaftsgefühl), and dancing through the here and now.",
      ],
      defaultSummary:
        "Adlerian Individual Psychology: teleological purpose, separation of interpersonal tasks, courage to face disapproval, and community feeling.",
    },
  },

  "1984": {
    id: "10",
    slug: "1984",
    title: "1984",
    author: "George Orwell",
    topic: "Classics",
    segments: [
      {
        title: "Part 1, Chapter 1 & 2: The Telescreen, Big Brother, and the Diary",
        pageNumber: 5,
        content: `It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions. The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured poster depicted simply an enormous face, more than a metre wide: the face of a man of about forty-five, with a heavy black moustache and ruggedly handsome features. BIG BROTHER IS WATCHING YOU, the caption ran.\n\nInside Winston's flat, the telescreen received and transmitted simultaneously; any sound made above a whisper would be picked up by the Thought Police, and every movement scrutinized. In an alcove out of the telescreen's line of sight, Winston opened a contraband blank book with creamy paper. With a pen dipped in ink, he committed the ultimate heresy: Thoughtcrime. His trembling hand wrote: DOWN WITH BIG BROTHER. Thoughtcrime does not entail death; thoughtcrime is death. The moment the pen touched paper, he was a dead man.`,
      },
      {
        title: "Part 1, Chapter 5 & Part 2, Chapter 9: Newspeak, Doublethink, and Mutability",
        pageNumber: 52,
        content: `In the canteen of the Ministry of Truth, Winston talks with Syme, a philologist working on the Eleventh Edition of the Newspeak Dictionary. 'It's a beautiful thing, the destruction of words,' Syme says with passionate fervor. 'Don't you see that the whole aim of Newspeak is to narrow the range of thought? In the end we shall make thoughtcrime literally impossible, because there will be no words in which to express it.' When orthodox concepts have no opposing vocabulary, heresy cannot even be conceptualized.\n\nWinston works in the Records Department, incinerating outdated editions of The Times in the memory holes and fabricating new pasts to align with Big Brother's latest prophecies. The Party slogan declares: 'Who controls the past controls the future: who controls the present controls the past.' This mutability of history is sustained by Doublethink: the power of holding two contradictory beliefs in one's mind simultaneously, and accepting both of them: to tell deliberate lies while genuinely believing in them, to forget any fact that has become inconvenient, and then to draw it back from oblivion again the moment it is needed.`,
      },
      {
        title: "Part 3, Chapter 2 & 5: Room 101, O'Brien, and the Elimination of the Self",
        pageNumber: 248,
        content: `In the subterranean windowless cells of the Ministry of Love, Winston encounters O'Brien, his interrogator and tormentor. O'Brien disabuses Winston of any naive delusions that the Party seeks power for noble ends: 'The Party seeks power entirely for its own sake. We are not interested in the good of others; we are interested solely in power. Pure power.' Power is not merely dominion over matter; it is power over minds: making a man suffer so that he yields his perception of reality to the Party. When O'Brien holds up four fingers, Winston must not merely say there are five; he must genuinely see five.\n\nThe final surrender takes place in Room 101, the room containing the worst thing in the world, differing from person to person. For Winston, it is carnivorous rats. Strapped to a chair with a wire cage fitted to his face, Winston breaks under sheer primal terror. To save himself, he must displace the torment onto the one person he loved: 'Do it to Julia! Not me! Julia!' With that betrayal, his soul is hollowed out. In the Chestnut Tree Cafe, looking up at the colossal portrait of Big Brother, the struggle is finished. He had won the victory over himself. He loved Big Brother.`,
      },
    ],
    domainContext: {
      authoritativeReferences: [
        {
          id: "ref-1984-orwell-01",
          source: "1984 (George Orwell)",
          edition: "Signet Classic Centenary Edition",
          type: "textbook",
          title: "The Principles of Newspeak and Doublethink",
          chapterOrSection: "Appendix: The Principles of Newspeak & Part II, Chapter 9",
          excerpt:
            "The purpose of Newspeak was not only to provide a medium of expression for the world-view and mental habits proper to the devotees of Ingsoc, but to make all other modes of thought impossible. Doublethink means the power of holding two contradictory beliefs in one's mind simultaneously, and accepting both of them.",
          clinicalPearls: [
            "Totalitarian language suppression restricts the cognitive boundaries of conceptual rebellion.",
            "Doublethink requires systemic cognitive dissonance normalized as moral orthodoxy.",
          ],
          relevanceTag: "totalitarian_linguistics",
        },
        {
          id: "ref-arendt-origins-01",
          source: "The Origins of Totalitarianism (Hannah Arendt)",
          edition: "Harcourt Brace",
          type: "textbook",
          title: "Totalitarian Propaganda and Atomization of Society",
          chapterOrSection: "Part 3: Totalitarianism in Power",
          excerpt:
            "The ideal subject of totalitarian rule is not the convinced Nazi or the convinced Communist, but people for whom the distinction between fact and fiction and the distinction between true and false no longer exist.",
          clinicalPearls: [
            "The erosion of objective truth leaves human consciousness defenseless against ideological tyranny.",
          ],
          relevanceTag: "epistemic_totalitarianism",
        },
      ],
      qbankVignettes: [
        {
          id: "qbank-1984-01",
          examType: "General Clinical",
          topic: "Cognitive Dissonance, Doublethink & Linguistic Control",
          difficulty: "hard",
          vignette:
            "An authoritarian government systematically abolishes nuanced vocabulary associated with liberty, civic assembly, and autonomous ethics, replacing them with binary compound tokens (e.g. 'goodthink', 'crimethink'). Concurrently, citizens are conditioned to maintain synchronized contradictory beliefs on state television to avoid criminal indictment.\n\nFrom George Orwell's linguistic and sociopolitical framework, what is the ultimate functional objective of this cognitive restriction?",
          options: [
            "To simplify bureaucratic paperwork and decrease clerical printing expenses",
            "To render rebellious, dissentient thoughts literally unthinkable by eliminating the linguistic concepts necessary to formulate them",
            "To encourage poetic brevity and aesthetic clarity in administrative communications",
            "To prepare the civilian population for rapid foreign language translation during wartime",
          ],
          correctIndex: 1,
          distractorRationales: {
            0: "Incorrect: Bureaucratic efficiency is a trivial administrative byproduct, not the ideological aim.",
            1: "Correct: Syme explicitly states that Newspeak's purpose is to contract the horizon of human thought so that unorthodox ideation becomes structurally and linguistically impossible.",
            2: "Incorrect: The aim is anti-poetic and destructive to literary expression.",
            3: "Incorrect: Totalitarian regimes seek insular xenophobic control rather than foreign translation readiness.",
          },
          highYieldTakeaway:
            "Language defines the boundaries of thought; restricting vocabulary and enforcing doublethink eradicates the capacity for critical cognitive dissent.",
          sourceQBank: "Totalitarian Systems & Epistemic Philosophy Bank",
        },
      ],
      mnemonics: [
        {
          mnemonic: "W-F-I",
          expansion:
            "War is Peace, Freedom is Slavery, Ignorance is Strength",
          rule: "The three paradoxical slogans of the Party illustrating Doublethink in Ingsoc.",
          clinicalContext: "Totalitarian propaganda and state cognitive control.",
        },
        {
          mnemonic: "D-O-U-B-L-E",
          expansion:
            "Deliberate deceit, Orthodoxy enforced, Unilateral erasure, Belief inverted, Linguistic erosion",
          rule: "The operational mechanisms sustaining Doublethink and psychological capitulation.",
          clinicalContext: "Analysis of coercive psychological conditioning.",
        },
      ],
      sectionSummaries: [
        "Panoptic surveillance under the telescreen, Big Brother's omnipresence, and Winston Smith's illicit diary thoughtcrime.",
        "The systematic contraction of human thought via Newspeak and the mutability of reality through Doublethink.",
        "Room 101, O'Brien's interrogations on power, and the ultimate destruction of personal love and autonomy.",
      ],
      defaultSummary:
        "Totalitarian Linguistics & Doublethink: Newspeak, panoptic surveillance, the erasure of historical truth, and psychological capitulation.",
    },
  },
};

/**
 * Normalizes input identifiers to resolve books by slug, id, or normalized title
 */
function resolveBookData(book: Partial<IBook>): InternalBookData | null {
  if (!book) return null;

  const targetSlug = book.slug?.toLowerCase().trim();
  const targetId = book._id ? String(book._id).trim() : "";
  const targetTitle = book.title?.toLowerCase().trim();

  // 1. Direct slug match
  if (targetSlug && SAMPLE_BOOKS_KNOWLEDGE[targetSlug]) {
    return SAMPLE_BOOKS_KNOWLEDGE[targetSlug];
  }

  // 2. ID match or alias match
  for (const entry of Object.values(SAMPLE_BOOKS_KNOWLEDGE)) {
    if (targetId && entry.id === targetId) {
      return entry;
    }
    if (targetSlug && entry.slug === targetSlug) {
      return entry;
    }
    if (targetTitle && entry.title.toLowerCase() === targetTitle) {
      return entry;
    }
  }

  return null;
}

/**
 * Returns authentic, high-quality multi-section study segments for a book,
 * with sensible fallback segments for unknown books.
 */
export function getSampleSegmentsForBook(book: Partial<IBook>): IBookSegmentData[] {
  const resolved = resolveBookData(book);
  const bookIdStr = book._id ? String(book._id) : (resolved?.id || "sample-book-id");
  const clerkIdStr = book.clerkId || "system-sample-corpus";

  if (resolved) {
    return resolved.segments.map((seg, index) => ({
      _id: `seg-${resolved.slug}-${index}`,
      clerkId: clerkIdStr,
      bookId: bookIdStr,
      content: seg.content,
      segmentIndex: index,
      pageNumber: seg.pageNumber,
      wordCount: countWords(seg.content),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  // Sensible fallback for unknown books
  const title = book.title || "Foundational Study Guide";
  const topic = book.topic || "Core Subject Analysis";
  const author = book.author || "Domain Scholar";

  const fallbackContents = [
    `Foundational Framework and First Principles of ${title}.\n\nWhen exploring ${title} within the domain of ${topic}, practitioners must first isolate the core invariants from superficial details. Author ${author} introduces the fundamental axioms that govern the subject: systematic decomposition of complex problems, rigorous observation of empirical evidence, and the avoidance of cognitive biases. By grounding study in these foundational principles, learners construct a durable mental model capable of navigating advanced real-world applications.`,
    `Methodological Analysis and Strategic Execution in ${title}.\n\nTransitioning from theoretical understanding to applied mastery requires structured operational workflows. In this segment, the core mechanics of ${topic} are analyzed through step-by-step methodologies. Key execution trade-offs are evaluated, highlighting how resource constraints, time horizons, and environmental feedback shape decision outcomes. Continuous iterative feedback and empirical verification serve as safeguards against systematic error.`,
    `Advanced Synthesis, Systemic Invariants, and Long-Term Mastery.\n\nThe culmination of ${title} lies in the holistic integration of its core principles into everyday practice. By examining complex edge cases, systemic interdependencies, and strategic trade-offs, the student cultivates intuitive expertise. Sustainable mastery in ${topic} demands active reflection, structured deliberate practice, and an enduring commitment to intellectual integrity.`,
  ];

  return fallbackContents.map((content, index) => ({
    _id: `seg-fallback-${bookIdStr}-${index}`,
    clerkId: clerkIdStr,
    bookId: bookIdStr,
    content,
    segmentIndex: index,
    pageNumber: index * 25 + 1,
    wordCount: countWords(content),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

/**
 * Returns domain-matched authoritative references, QBank vignettes, mnemonics,
 * and section summary for a sample book or sensible fallbacks for unknown books.
 */
export function getBookDomainContext(
  book: Partial<IBook>,
  segmentIndex?: number
): BookDomainContext {
  const resolved = resolveBookData(book);

  if (resolved) {
    const dc = resolved.domainContext;
    const summary =
      segmentIndex !== undefined &&
      segmentIndex >= 0 &&
      segmentIndex < dc.sectionSummaries.length
        ? dc.sectionSummaries[segmentIndex]
        : dc.defaultSummary;

    return {
      authoritativeReferences: dc.authoritativeReferences,
      qbankVignettes: dc.qbankVignettes,
      mnemonics: dc.mnemonics,
      sectionSummary: summary,
    };
  }

  // Sensible fallback domain context for unknown books
  const title = book.title || "Core Foundational Text";
  const topic = book.topic || "General Study";

  const fallbackSummary =
    segmentIndex !== undefined
      ? `Analysis of ${title} (Section ${segmentIndex + 1}): Key thematic invariants, empirical methodologies, and core principles in ${topic}.`
      : `Comprehensive conceptual framework for ${title} covering foundational theories, strategic methodologies, and high-yield applications in ${topic}.`;

  const fallbackReference: ReferenceResource = {
    id: `ref-fallback-${book.slug || "general"}`,
    source: `Authoritative Literature on ${topic}`,
    type: "textbook",
    title: `Foundations of ${title}`,
    chapterOrSection: "Core Reference Chapter: First Principles & Verification",
    excerpt: `The established academic and professional literature on ${topic} emphasizes first-principles reasoning: decomposing composite systems into irreducible invariants and verifying assumptions against empirical evidence.`,
    clinicalPearls: [
      `Deconstruct composite problems into foundational invariants within ${topic}.`,
      "Validate assumptions through direct empirical observation and peer-reviewed standards.",
    ],
    relevanceTag: `${topic.toLowerCase().replace(/\s+/g, "_")}_foundations`,
  };

  const fallbackQBank: QBankVignette = {
    id: `qbank-fallback-${book.slug || "general"}`,
    examType: "General Clinical",
    topic: `Core Principles & Analytical Problem Solving in ${topic}`,
    difficulty: "hard",
    vignette: `A practitioner working in the field of ${topic} observes contradictory telemetry when applying conventional heuristics to a complex operational scenario outlined in ${title}.\n\nAccording to rigorous first-principles methodology, what is the most scientifically sound initial course of action?`,
    options: [
      "Adhere strictly to prevailing dogma and ignore anomalous data points",
      "Isolate key dependent and independent variables, formulate a falsifiable hypothesis, and test baseline assumptions against empirical controls",
      "Immediately escalate the issue to external regulators without collecting local diagnostic data",
      "Cease all operational activities permanently to prevent further uncertainty",
    ],
    correctIndex: 1,
    distractorRationales: {
      0: "Incorrect: Dogmatic adherence without empirical verification breeds systemic errors.",
      1: "Correct: Systematic variable isolation and empirical testing represent the gold standard of scientific problem-solving.",
      2: "Incorrect: Premature escalation without local diagnostic triage is inefficient and unhelpful.",
      3: "Incorrect: Abandoning operations is an unconstructive reaction to anomalous findings.",
    },
    highYieldTakeaway:
      "When standard heuristics conflict with real-world observations, isolate variables and verify primary invariants from first principles.",
    sourceQBank: `${topic} Analytical Reasoning Board`,
  };

  const fallbackMnemonic: HighYieldMnemonic = {
    mnemonic: "F-I-R-S-T",
    expansion:
      "Foundations, Invariants, Rigor, Systematic verification, Transparency",
    rule: `The universal framework for mastering complex conceptual domains in ${topic}.`,
    clinicalContext: `Cognitive problem-solving and domain mastery in ${topic}.`,
  };

  return {
    authoritativeReferences: [fallbackReference],
    qbankVignettes: [fallbackQBank],
    mnemonics: [fallbackMnemonic],
    sectionSummary: fallbackSummary,
  };
}
