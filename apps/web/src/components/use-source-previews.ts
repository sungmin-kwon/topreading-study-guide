"use client";
import { useEffect, useRef, useState } from "react";

type Preview = {
  image: string;
  label: string;
  bookmarks?: { page: number; offset: number; title: string }[];
};
type Entry = { preview?: Preview; error?: string };

/** Private, bounded memory cache. No browser storage or public asset URLs. */
export function useSourcePreviews(
  base: string | null,
  visible: number[],
  adjacent: number[],
) {
  const cache = useRef(new Map<string, Preview>());
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const visibleKey = visible.join(","),
    adjacentKey = adjacent.join(",");
  useEffect(() => {
    cache.current.clear();
    setEntries({});
  }, [base]);
  useEffect(() => {
    if (!base) return;
    const abort = new AbortController();
    const requested = visibleKey.split(",").map(Number);
    const neighbors = adjacentKey ? adjacentKey.split(",").map(Number) : [];
    const key = (page: number) => `${base}?page=${page}`;
    const failures: Record<string, Entry> = {};
    const publish = () => {
      if (abort.signal.aborted) return;
      setEntries({
        ...Object.fromEntries(
          [...cache.current].map(([url, preview]) => [url, { preview }]),
        ),
        ...failures,
      });
    };
    async function load(page: number) {
      const url = key(page);
      const cached = cache.current.get(url);
      if (cached) {
        cache.current.delete(url);
        cache.current.set(url, cached);
        return;
      }
      const response = await fetch(url, { signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not load page.");
      if (abort.signal.aborted) return;
      cache.current.set(url, data);
      while (cache.current.size > 8)
        cache.current.delete(cache.current.keys().next().value!);
    }
    publish();
    // At most two foreground renders; one speculative render at a time.
    void Promise.all(
      requested.map(async (page) => {
        try {
          await load(page);
          publish();
        } catch (error) {
          if (!abort.signal.aborted) {
            failures[key(page)] = {
              error:
                error instanceof Error ? error.message : "Could not load page.",
            };
            publish();
          }
        }
      }),
    ).then(async () => {
      for (const page of neighbors) {
        if (abort.signal.aborted) break;
        try {
          await load(page);
        } catch {
          /* A speculative failure must not interrupt reading. */
        }
      }
    });
    return () => abort.abort();
  }, [base, visibleKey, adjacentKey]);
  return (page: number): Entry => {
    if (!base) return {};
    const key = `${base}?page=${page}`;
    const preview = cache.current.get(key);
    return preview ? { preview } : entries[key] || {};
  };
}
