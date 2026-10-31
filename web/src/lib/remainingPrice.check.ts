// npx tsx src/lib/remainingPrice.check.ts
import assert from "node:assert/strict";
import { remainingPrice as r } from "./remainingPrice";

assert.equal(r("THB 4,200", "THB 1,000"), "THB 3,200.00");
assert.equal(r("₱4,200.50", "₱1,000.25"), "₱3,200.25");
assert.equal(r("4,200 THB", "1,000 THB"), "3,200.00 THB");
assert.equal(r("4200", "1000"), "3,200.00");

// The currency only needs saying once, and spacing or case doesn't change it.
assert.equal(r("THB 4,200", "1,000"), "THB 3,200.00");
assert.equal(r("4,200", "THB 1,000"), "THB 3,200.00");
assert.equal(r("THB4,200", "thb 1,000"), "THB3,200.00");

// Older prices carry a note after the amount.
assert.equal(r("THB 4,200 · paid", "THB 4,200"), "THB 0.00");
assert.equal(r("THB 4,200", "THB 1,000 (deposit)"), "THB 3,200.00");

assert.equal(r("THB 4,200", "0"), "THB 4,200.00", "paid nothing yet is still an answer");
assert.equal(r("THB 1,000", "THB 1,200"), "THB -200.00", "overpaid shows, not hides, the mistake");
assert.equal(r("0.30", "0.10"), "0.20", "float noise stays out of the result");

// Anything unsure stays blank rather than showing a wrong amount.
assert.equal(r("THB 4,200", ""), "", "blank paid isn't 0: an older price may say it's paid");
assert.equal(r("", "THB 1,000"), "");
assert.equal(r("THB 4,200", "USD 50"), "", "different currencies");
assert.equal(r("THB 4,200", "₱1,000"), "", "different currencies");
assert.equal(r("THB 4,200", "30%"), "", "a percentage isn't an amount");
assert.equal(r("THB 4,200", "30% deposit"), "", "a percentage isn't an amount");
assert.equal(r("THB 4k", "THB 1,000"), "", "shorthand isn't an amount");
assert.equal(r("2 x THB 1,000", "THB 500"), "", "more than one number");
assert.equal(r("about THB 4,200", "THB 1,000"), "", "words before the currency");
assert.equal(r("Free", "0"), "");

console.log("remainingPrice checks passed");
