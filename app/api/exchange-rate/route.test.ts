import { describe, expect, it } from "vitest";

import { __testables } from "./route";

describe("parseEcbDailyRates", () => {
  it("inverse le cours BCE exprimé en CNY pour un euro", () => {
    const parsed = __testables.parseEcbDailyRates(
      "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE\n" +
        "EXR.D.CNY.EUR.SP00.A,D,CNY,EUR,SP00,A,2026-08-28,7.8251\n",
    );

    expect(parsed).toEqual({ date: "2026-08-28", cnyPerEur: 7.8251 });
    expect(1 / parsed.cnyPerEur).toBeCloseTo(0.127794, 6);
  });

  it("refuse une réponse incomplète", () => {
    expect(() => __testables.parseEcbDailyRates("<Cube />")).toThrow(
      /taux CNY valide/,
    );
  });
});
