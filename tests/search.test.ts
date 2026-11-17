import { describe, expect, it } from "vitest";
import { createFingerprint, hash } from "@koda.sh/motif-core";
import { createIndex, loadIndex } from "../src/index.js";

interface Book {
  title: string;
  author: { name: string };
  tags: string[];
}

const books: Book[] = [
  {
    title: "The Pragmatic Programmer",
    author: { name: "Andy Hunt" },
    tags: ["engineering", "software"],
  },
  {
    title: "Designing Data-Intensive Applications",
    author: { name: "Martin Kleppmann" },
    tags: ["systems", "databases"],
  },
  {
    title: "Sourdough Baking at Home",
    author: { name: "Jane Baker" },
    tags: ["cooking", "bread"],
  },
];

describe("motif-search", () => {
  it("searches plain string arrays", () => {
    const docs = [
      "Locality-sensitive hashing reduces dimensionality for fast similarity search.",
      "A completely unrelated sentence about baking sourdough bread.",
    ];
    const index = createIndex(docs);
    const results = index.search("locality sensitive hashing similarity search");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].refIndex).toBe(0);
    expect(results[0].similarity).toBeGreaterThan(0.2);
  });

  it("searches objects with weighted keys and nested paths", () => {
    const index = createIndex(books, {
      keys: [{ name: "title", weight: 2 }, "author.name", "tags"],
    });

    const results = index.search("Pragmatic Programmer", { limit: 2 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.title).toBe("The Pragmatic Programmer");
  });

  it("supports custom getFn", () => {
    const index = createIndex(books, {
      keys: [
        {
          name: "combined",
          getFn: (b) => `${b.title} ${b.author.name}`,
        },
      ],
    });

    const results = index.search("Martin Kleppmann Data-Intensive");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.author.name).toBe("Martin Kleppmann");
  });

  it("accepts Fingerprint and FingerprintRecord queries", () => {
    const index = createIndex(books, {
      keys: ["title"],
    });

    const fp = createFingerprint("Designing Data-Intensive Applications");
    const fpResults = index.search(fp);
    expect(fpResults[0].item.title).toBe("Designing Data-Intensive Applications");

    const rec = hash("Sourdough Baking at Home");
    const recResults = index.search(rec);
    expect(recResults[0].item.title).toBe("Sourdough Baking at Home");
  });

  it("returns per-key ComparisonResult when includeDetails is true", () => {
    const index = createIndex(books, {
      keys: ["title", "author.name"],
    });

    const results = index.search("Pragmatic Programmer", { includeDetails: true });
    expect(results[0].details).toBeDefined();
    expect(results[0].details?.title).toBeDefined();
    expect(results[0].details?.title.similarity).toBeGreaterThan(0);
  });

  it("supports add() and remove()", () => {
    const index = createIndex(books.slice(0, 2), { keys: ["title"] });
    expect(index.size).toBe(2);

    index.add(books[2]);
    expect(index.size).toBe(3);

    const addedResults = index.search("Sourdough Baking");
    expect(addedResults[0].item.title).toBe("Sourdough Baking at Home");

    const removed = index.remove((b) => b.title.includes("Sourdough"));
    expect(removed).toBe(1);
    expect(index.size).toBe(2);
  });

  it("exports and loads a serialized index", () => {
    const index = createIndex(books, { keys: ["title", "author.name"] });
    const serialized = index.export();

    const restored = loadIndex(serialized, books, { keys: ["title", "author.name"] });
    const results = restored.search("Pragmatic Programmer");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.title).toBe("The Pragmatic Programmer");
  });

  it("handles empty collections and empty queries", () => {
    const empty = createIndex<string>([]);
    expect(empty.size).toBe(0);
    expect(empty.search("anything")).toEqual([]);

    const index = createIndex(books, { keys: ["title"] });
    expect(index.search("")).toEqual([]);
    expect(index.search("   ")).toEqual([]);
  });

  it("respects limit: 0, minSimilarity, and minContainment", () => {
    const index = createIndex(books, { keys: ["title"] });

    expect(index.search("Pragmatic Programmer", { limit: 0 })).toEqual([]);
    expect(index.search("Pragmatic Programmer", { minSimilarity: 1.0 })).toEqual([]);
    expect(index.search("Pragmatic Programmer", { minContainment: 1.0 })).toEqual([]);
  });

  it("rebuilds LSH buckets accurately after remove()", () => {
    const index = createIndex(books, { keys: ["title"] });
    index.remove((b) => b.title.includes("Pragmatic"));

    const results = index.search("Pragmatic Programmer");
    expect(results.every((r) => !r.item.title.includes("Pragmatic"))).toBe(true);
    expect(results.every((r) => index.items[r.refIndex] === r.item)).toBe(true);
  });

  it("throws when loading an unsupported serialized index version", () => {
    const index = createIndex(books, { keys: ["title"] });
    const serialized = { ...index.export(), version: 999 };

    expect(() => loadIndex(serialized, books)).toThrow(/Unsupported serialized index version/);
  });
});
