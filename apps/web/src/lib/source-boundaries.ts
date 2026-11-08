export type SourcePage = {
  pageNumber: number;
  textContent: string;
};
export type Boundary = {
  page: number;
  offset: number;
  title: string;
};
export type PageLabelRange = {
  from: number;
  to: number;
  first: number;
};
export type SplitPlan = {
  pageLabels?: PageLabelRange[];
  starts: Boundary[];
  end: {
    page: number;
    offset: number;
  } | null;
};
export function splitAtBoundaries(pages: SourcePage[], plan: SplitPlan) {
  if (
    !plan ||
    !Array.isArray(plan.starts) ||
    !plan.starts.length ||
    plan.starts.length > 1000
  )
    throw new Error("Mark at least one chapter start (maximum 1,000).");
  const ranges = plan.pageLabels || [];
  if (
    !Array.isArray(ranges) ||
    ranges.length > 100 ||
    ranges.some(
      (r) =>
        ![r.from, r.to, r.first].every(Number.isInteger) ||
        r.from < 1 ||
        r.to < r.from ||
        r.first < 1,
    )
  )
    throw new Error("Printed-page ranges must use positive whole numbers.");
  for (let i = 0; i < ranges.length; i++)
    for (let j = i + 1; j < ranges.length; j++)
      if (ranges[i].from <= ranges[j].to && ranges[j].from <= ranges[i].to)
        throw new Error("Printed-page ranges overlap.");
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const positions = new Map<
    number,
    {
      start: number;
      text: string;
    }
  >();
  let text = "";
  for (const page of sorted) {
    positions.set(page.pageNumber, {
      start: text.length,
      text: page.textContent,
    });
    text += page.textContent + "\n\n";
  }
  const locate = (point: { page: number; offset: number }) => {
    const p = positions.get(point.page);
    if (
      !p ||
      !Number.isInteger(point.offset) ||
      point.offset < 0 ||
      point.offset > p.text.length
    )
      throw new Error("A boundary no longer matches the source text.");
    return p.start + point.offset;
  };
  const starts = plan.starts
    .map((b) => ({
      ...b,
      title: typeof b.title === "string" ? b.title.trim().slice(0, 200) : "",
      position: locate(b),
    }))
    .sort((a, b) => a.position - b.position);
  if (new Set(starts.map((b) => b.position)).size !== starts.length)
    throw new Error("Two chapters start at the same position.");
  const end = plan.end ? locate(plan.end) : text.length;
  if (end <= starts[starts.length - 1].position)
    throw new Error("The reading end must follow the last chapter start.");
  return starts.map((start, i) => {
    const content = text
      .slice(start.position, starts[i + 1]?.position ?? end)
      .trim();
    if (!content)
      throw new Error(
        "A chapter has no readable text. Move or remove its boundary.",
      );
    return {
      chapterNumber: i + 1,
      title: start.title || `Chapter ${i + 1}`,
      textContent: content,
      wordCount: content.split(/\s+/).length,
      sortOrder: i + 1,
      start: { page: start.page, offset: start.offset },
    };
  });
}
