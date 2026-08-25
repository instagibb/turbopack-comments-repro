// Identical to leading-only.ts except for ONE trailing comment below.

/* istanbul ignore next -- this function must not be instrumented */
export function withTrailing() {
  return "with-trailing";
}

export const unrelated = 1; // one trailing comment
