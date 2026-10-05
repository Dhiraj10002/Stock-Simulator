import test from "node:test";
import assert from "node:assert/strict";
import { formatKiteSymbol } from "./instrumentDisplay";

test("search labels preserve canonical option strike across broker date formats", () => {
  for (const symbol of ["TCS26DEC1920PE", "TCS31DEC261920PE"]) {
    assert.equal(
      formatKiteSymbol(symbol, "31DEC2026", "1920", "PE").displayName,
      "TCS DEC 1920 PE",
    );
  }
  assert.equal(
    formatKiteSymbol("NIFTY26OCT25500CE", "29OCT2026", "25500", "CE")
      .displayName,
    "NIFTY OCT 25500 CE",
  );
});

test("ambiguous option symbols stay exact when canonical strike is missing", () => {
  assert.equal(
    formatKiteSymbol("TCS26DEC1920PE").displayName,
    "TCS26DEC1920PE",
  );
});

test("canonical decimal strike is already rupees and is never scaled a second time", () => {
  assert.equal(
    formatKiteSymbol("NIFTY 125000 CE", "29OCT2026", "125000.50", "CE")
      .displayName,
    "NIFTY OCT 125000.5 CE",
  );
  assert.equal(
    formatKiteSymbol("CONTRACT", "29OCT2026", "125000.50", "CE").displayName,
    "CONTRACT OCT 125000.5 CE",
  );
});
