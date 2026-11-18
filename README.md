![Motif Search](docs/images/msheader.png)

# `@koda.sh/motif-search`

In-memory similarity search engine powered by [`@koda.sh/motif-core`](https://www.npmjs.com/package/@koda.sh/motif-core).

- **MinHash + LSH**: Fast candidate retrieval and Jaccard similarity scoring without external dependencies.
- **Weighted multi-field search**: Index dot-notation paths or custom `getFn` extractors with per-field weights.
- **Direct fingerprint queries**: Search using plain strings, `Fingerprint`, or `FingerprintRecord` instances from `motif-core`.
- **Serializable**: Export and restore pre-hashed indexes with `index.export()` and `loadIndex()`.

---

## Installation

```bash
npm install @koda.sh/motif-search @koda.sh/motif-core
```

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
console.log(results[0].item.title, results[0].similarity);
```

## Documentation

- [API Surface Reference](docs/surface.md)
- [Design Formula](formula.md)

## License

MPL-2.0

![Motif Footer](docs/images/kmfooter.png)
