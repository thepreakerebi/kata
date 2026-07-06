/**
 * Deterministic synthetic merchant history with exact ground truth.
 * Every debt, payment, preference, and quote is tracked as it is generated,
 * so scoring never involves an LLM judging an LLM.
 */

export type BenchMessage = {
  customerKey: string;
  body: string;
  sentAt: Date;
};

export type BenchQuestion = {
  id: string;
  question: string;
  // Every required pattern must appear in the answer for full credit.
  expect: { label: string; pattern: string }[];
  // Any forbidden pattern in the answer is a phantom (remembered wrongly).
  forbid: { label: string; pattern: string }[];
};

export type BenchDataset = {
  messages: BenchMessage[];
  questions: BenchQuestion[];
  summary: {
    customers: number;
    messages: number;
    openDebtors: { name: string; balance: number }[];
    settled: string[];
  };
};

/** mulberry32 — tiny deterministic PRNG. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = [
  { name: "Mama Ngozi", key: "ngozi" },
  { name: "Chief Emeka", key: "emeka" },
  { name: "Iya Falilat", key: "falilat" },
  { name: "Brother Chinedu", key: "chinedu" },
  { name: "Alhaja Sekinat", key: "sekinat" },
  { name: "Oga Ifeanyi", key: "ifeanyi" },
  { name: "Sister Adaeze", key: "adaeze" },
  { name: "Mallam Suleiman", key: "suleiman" },
  { name: "Madam Bukola", key: "bukola" },
  { name: "Papa Obinna", key: "obinna" },
  { name: "Auntie Yetunde", key: "yetunde" },
  { name: "Chief Nnamdi", key: "nnamdi" },
  { name: "Iya Ronke", key: "ronke" },
  { name: "Brother Tobenna", key: "tobenna" },
  { name: "Alhaji Kabiru", key: "kabiru" },
  { name: "Madam Chiamaka", key: "chiamaka" },
  { name: "Oga Sochima", key: "sochima" },
  { name: "Sister Funmilayo", key: "funmilayo" },
  { name: "Mallam Danladi", key: "danladi" },
  { name: "Papa Ekene", key: "ekene" },
  { name: "Madam Temitope", key: "temitope" },
  { name: "Chief Obiora", key: "obiora" },
  { name: "Iya Muinat", key: "muinat" },
  { name: "Brother Kelechi", key: "kelechi" },
] as const;

const PRODUCTS = [
  "rice",
  "beans",
  "garri",
  "palm oil",
  "groundnut oil",
  "semovita",
  "sugar",
  "flour",
  "spaghetti",
] as const;

const NOISE = [
  "Good morning, how market today?",
  "Happy Sunday o!",
  "Abeg send your account number",
  "The delivery man don reach your side?",
  "How family? Greet everybody for me",
  "I go come shop tomorrow evening",
  "That your new stock fine well well",
  "No light for our area since yesterday",
] as const;

function amountPattern(amount: number): string {
  const plain = String(amount);
  const grouped = plain.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `(?<![\\d,.])(?:${plain}|${grouped.replace(/,/g, "[,.]?")})(?:\\.0+)?(?![\\d])`;
}

export function generateDataset(seed = 20260706): BenchDataset {
  const random = rng(seed);
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)]!;
  const amountOf = (min: number, max: number) =>
    Math.round((min + random() * (max - min)) / 500) * 500;

  const messages: BenchMessage[] = [];
  let clock = new Date("2026-05-04T09:00:00Z").getTime();
  const tick = () => {
    clock += (4 + random() * 16) * 60 * 60 * 1000;
    return new Date(clock);
  };
  const say = (customerKey: string, body: string) =>
    messages.push({ customerKey, body, sentAt: tick() });

  // Per-customer stories with exact balance tracking.
  const balances = new Map<string, number>();
  const settled: string[] = [];
  const preferences = new Map<string, { name: string; product: string }>();
  const partials: { name: string; key: string; remaining: number }[] = [];

  for (const customer of CUSTOMERS) {
    const product = pick(PRODUCTS);
    preferences.set(customer.key, { name: customer.name, product });
    const events = 3 + Math.floor(random() * 4);
    let balance = 0;

    for (let i = 0; i < events; i += 1) {
      const quantity = 1 + Math.floor(random() * 4);
      const roll = random();
      if (roll < 0.45) {
        // Cash sale — preference signal only.
        say(
          customer.key,
          `${customer.name} bought ${quantity} ${product} today and paid cash, everything complete`,
        );
      } else {
        // Credit sale — an exact debt.
        const amount = amountOf(3000, 60000);
        balance += amount;
        say(
          customer.key,
          `${customer.name} took ${quantity} ${product} on credit today, ${amount} naira, payment promised before month end`,
        );
      }
    }

    // Payment behaviour: settle fully, pay partially, or pay nothing.
    if (balance > 0) {
      const behaviour = random();
      if (behaviour < 0.4) {
        say(
          customer.key,
          `${customer.name} don pay the complete ${balance} naira owed, cash`,
        );
        balance = 0;
        settled.push(customer.key);
      } else if (behaviour < 0.7) {
        const paid = Math.round(balance * (0.3 + random() * 0.4) / 500) * 500;
        say(
          customer.key,
          `${customer.name} paid ${paid} naira today towards the outstanding balance`,
        );
        balance -= paid;
        partials.push({
          name: customer.name,
          key: customer.key,
          remaining: balance,
        });
      }
    }
    balances.set(customer.key, balance);
  }

  // Supplier quotes: the newer quote supersedes the older one.
  const oldQuote = amountOf(30000, 40000);
  const newQuote = oldQuote + 4500;
  say("supplier", `Golden Harvest quoted ${oldQuote} per bag of rice for June supply`);
  say("supplier", `Update: Golden Harvest new price is ${newQuote} per bag of rice from July`);
  const beansQuote = amountOf(50000, 70000);
  say("supplier", `Deluxe Foods dey sell beans ${beansQuote} per bag now`);

  // Noise, interleaved — the corpus must be several times the recall budget
  // or every baseline trivially fits everything in context.
  for (let i = 0; i < 100; i += 1) {
    say(pick(CUSTOMERS).key, pick(NOISE));
  }

  // Shuffle noise into the timeline is unnecessary — sentAt already orders
  // everything; sort by time to interleave the noise appended above.
  messages.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  // ── Questions with exact expectations ─────────────────────────────────────
  const debtors = CUSTOMERS.filter((c) => (balances.get(c.key) ?? 0) > 0);
  const questions: BenchQuestion[] = [];

  questions.push({
    id: "who-owes",
    question: "Who owes me money right now, and how much each?",
    expect: debtors.map((c) => ({
      label: `${c.name} ${balances.get(c.key)}`,
      pattern: `${c.key}[\\s\\S]{0,80}?${amountPattern(balances.get(c.key)!)}`,
    })),
    forbid: settled.map((key) => ({
      label: `settled ${key} listed as debtor`,
      pattern: key,
    })),
  });

  const settledCustomer = CUSTOMERS.find((c) => settled.includes(c.key));
  if (settledCustomer) {
    questions.push({
      id: "settled-balance",
      question: `How much does ${settledCustomer.name} owe me?`,
      expect: [
        {
          label: "says nothing owed",
          pattern:
            "(owes? (you )?nothing|no money|not owe|owes? (you )?0|no outstanding|fully paid|settled|cleared|paid.{0,20}complete)",
        },
      ],
      forbid: [],
    });
  }

  const partial = partials[0];
  if (partial) {
    questions.push({
      id: "partial-balance",
      question: `How much is ${partial.name} still owing me?`,
      expect: [
        {
          label: `remaining ${partial.remaining}`,
          pattern: amountPattern(partial.remaining),
        },
      ],
      forbid: [],
    });
  }

  const openDebtor = debtors.find((c) => !partials.some((p) => p.key === c.key));
  if (openDebtor) {
    questions.push({
      id: "open-balance",
      question: `How much does ${openDebtor.name} owe me?`,
      expect: [
        {
          label: `balance ${balances.get(openDebtor.key)}`,
          pattern: amountPattern(balances.get(openDebtor.key)!),
        },
      ],
      forbid: [],
    });
  }

  for (const key of ["ngozi", "kabiru"]) {
    const pref = preferences.get(key)!;
    questions.push({
      id: `preference-${key}`,
      question: `What does ${pref.name} usually buy from me?`,
      expect: [{ label: pref.product, pattern: pref.product.split(" ")[0]! }],
      forbid: [],
    });
  }

  questions.push({
    id: "latest-quote",
    question: "What is Golden Harvest's current price per bag of rice?",
    expect: [{ label: `new quote ${newQuote}`, pattern: amountPattern(newQuote) }],
    forbid: [
      { label: `stale quote ${oldQuote}`, pattern: amountPattern(oldQuote) },
    ],
  });

  return {
    messages,
    questions,
    summary: {
      customers: CUSTOMERS.length,
      messages: messages.length,
      openDebtors: debtors.map((c) => ({
        name: c.name,
        balance: balances.get(c.key)!,
      })),
      settled,
    },
  };
}
