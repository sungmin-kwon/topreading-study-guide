export type PageLayout = "single" | "pairs" | "facing";

/** Physical source pages: printed labels never change the pairing. */
export function sourceSpread(
  page: number,
  count: number,
  layout: PageLayout,
): number[] {
  if (layout === "single" || (layout === "facing" && page === 1)) return [page];
  const first =
    layout === "pairs" ? page - ((page - 1) % 2) : page - (page % 2);
  return [first, first + 1].filter((n) => n >= 1 && n <= count);
}

export function nearbySourcePages(
  pages: number[],
  count: number,
  layout: PageLayout,
): number[] {
  const next = pages[pages.length - 1] + 1,
    previous = pages[0] - 1;
  return [
    ...(next <= count ? sourceSpread(next, count, layout) : []),
    ...(previous >= 1 ? sourceSpread(previous, count, layout) : []),
  ];
}
