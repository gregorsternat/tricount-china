import { describe, expect, it } from "vitest";

import { RefreshEpoch } from "./refresh-epoch";

describe("RefreshEpoch", () => {
  it("makes a refresh started during a mutation stale before the mutation snapshot is applied", () => {
    const epochs = new RefreshEpoch();

    epochs.invalidate(); // mutation starts
    const refreshStartedDuringMutation = epochs.begin();
    epochs.invalidate(); // mutation response is ready to commit

    expect(epochs.isCurrent(refreshStartedDuringMutation)).toBe(false);
  });

  it("keeps only the latest of two overlapping refreshes current", () => {
    const epochs = new RefreshEpoch();
    const first = epochs.begin();
    const second = epochs.begin();

    expect(epochs.isCurrent(first)).toBe(false);
    expect(epochs.isCurrent(second)).toBe(true);
  });
});
