# `@koda.sh/motif-search` API Surface

`@koda.sh/motif-search` is an in-memory similarity search library built on `@koda.sh/motif-core`. It follows `motif-core`'s factory + lightweight object conventions (`createIndex(...)` returning a `MotifIndex<T>`) and reuses `HashOptions`, `LshBandOptions`, `Fingerprint`, `FingerprintRecord`, and `ComparisonResult` directly.

---

## Quick Start

```ts
import { createIndex } from "@koda.sh/motif-search";

const books = [
  { title: "The Pragmatic Programmer", author: { name: "Andy Hunt" }, tags: ["engineering"] },
  { title: "Designing Data-Intensive Applications", author: { name: "Martin Kleppmann" }, tags: ["systems"] },
];

const index = createIndex(books, {
  keys: [{ name: "title", weight: 2 }, "author.name", "tags"],
});

const results = index.search("Pragmatic Programmer", { limit: 5 });
```

---

## Entry Points

### `createIndex<T>(items, options?)`

Creates an in-memory `MotifIndex<T>` from an array of strings or objects.

```ts
function createIndex<T>(
  items: readonly T[],
  options?: IndexOptions<T>,
): MotifIndex<T>;
```

- **`items`**: Initial collection to index.
- **`options`**: Optional `IndexOptions<T>` configuring keys, hashing, LSH banding, and default thresholds.

### `loadIndex<T>(serialized, items, options?)`

Restores a `MotifIndex<T>` from a `SerializedIndex` produced by `index.export()`, avoiding re-hashing `items` at startup.

```ts
function loadIndex<T>(
  serialized: SerializedIndex,
  items: readonly T[],
  options?: IndexOptions<T>,
): MotifIndex<T>;
```

---

## `MotifIndex<T>`

The object returned by `createIndex` and `loadIndex`.

| Member | Signature | Description |
| --- | --- | --- |
| `size` | `readonly size: number` | Number of items currently in the index. |
| `items` | `readonly items: readonly T[]` | Read-only view of the indexed items. |
| `search` | `search(query, options?): SearchResult<T>[]` | Searches the index using a `string`, `Fingerprint`, or `FingerprintRecord`. |
| `add` | `add(...items: readonly T[]): this` | Appends one or more items to the index and updates LSH buckets. |
| `remove` | `remove(predicate: (item: T, refIndex: number) => boolean): number` | Removes matching items, rebuilds LSH buckets, and returns the count removed. |
| `export` | `export(): SerializedIndex` | Serializes the hashed field records and index metadata to a JSON-safe object. |

### Querying with `Fingerprint` or `FingerprintRecord`

`search()` accepts precomputed `motif-core` values in addition to plain strings:

```ts
import { createFingerprint, hash } from "@koda.sh/motif-core";

const fp = createFingerprint("Designing Data-Intensive Applications");
index.search(fp);

const record = hash("Designing Data-Intensive Applications");
index.search(record);
```

---

## Options & Configuration

### `IndexOptions<T>`

```ts
interface IndexOptions<T> {
  keys?: Array<KeyPath<T> | KeyConfig<T>>;
  hash?: HashOptions;
  lsh?: LshBandOptions;
  minSimilarity?: number;
  minContainment?: number;
}
```

- **`keys`**: Fields to extract and hash. Accepts dot-notation strings (e.g. `"author.name"`) or `KeyConfig<T>` objects. When omitted, string items are indexed directly.
- **`hash`**: Passed directly to `motif-core`'s `hash(text, options)` (`size`, `varigramSize`, `shingleSize`, `stopWords`, `normalize`).
- **`lsh`**: Passed to `motif-core` for LSH candidate bucketing. Defaults to `optimalBands(Math.max(minSimilarity, 0.2), fpSize)`.
- **`minSimilarity`**: Minimum weighted similarity (`0.0` to `1.0`, higher = better) required to include a result. Default: `0.1`.
- **`minContainment`**: Optional minimum weighted containment (`0.0` to `1.0`).

### `KeyConfig<T>`

```ts
interface KeyConfig<T> {
  name: KeyPath<T>;
  weight?: number;
  getFn?: (item: T) => string | string[] | null | undefined;
}
```

- **`name`**: Field identifier (used for dot-notation lookup when `getFn` is omitted, and as the key in `SearchResult.details`).
- **`weight`**: Relative weight when combining per-field similarities. Default: `1`.
- **`getFn`**: Custom extractor for derived or computed text.

### `SearchOptions`

Per-query overrides for `index.search(query, options)`:

```ts
interface SearchOptions {
  limit?: number;
  minSimilarity?: number;
  minContainment?: number;
  includeDetails?: boolean;
}
```

- **`limit`**: Maximum number of results to return (sorted by descending `similarity`).
- **`minSimilarity` / `minContainment`**: Override the index-level thresholds for this query.
- **`includeDetails`**: When `true`, attaches per-field `ComparisonResult` objects from `motif-core` under `result.details`.

---

## Results

### `SearchResult<T>`

```ts
interface SearchResult<T> {
  item: T;
  refIndex: number;
  similarity: number;
  containment?: number;
  details?: Record<string, ComparisonResult>;
}
```

- **`item`**: The matched item from `items`.
- **`refIndex`**: Zero-based index of `item` in `index.items`.
- **`similarity`**: Weighted Jaccard similarity (`0.0` to `1.0`, higher = better).
- **`containment`**: Weighted containment estimate (`0.0` to `1.0`), when available.
- **`details`**: Per-field `ComparisonResult` map, populated when `includeDetails: true`.
