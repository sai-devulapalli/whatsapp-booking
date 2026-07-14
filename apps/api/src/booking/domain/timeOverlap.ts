interface Instant {
  valueOf(): number;
}

/** Pure half-open interval overlap check; works with both `Date` and Luxon `DateTime`. */
export function rangesOverlap(aStart: Instant, aEnd: Instant, bStart: Instant, bEnd: Instant): boolean {
  return aStart.valueOf() < bEnd.valueOf() && bStart.valueOf() < aEnd.valueOf();
}
