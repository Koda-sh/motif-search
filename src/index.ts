import {
  Fingerprint,
  hash,
  optimalBands,
  type ComparisonResult,
  type FingerprintRecord,
  type HashOptions,
  type LshBandOptions,
  type ResolvedBands,
} from "@koda.sh/motif-core";
import { extractFields, normalizeKeys, type NormalizedKey } from "./extract.js";
import type {
  IndexOptions,
  MotifIndex,
  SearchOptions,
  SearchResult,
  SerializedEntry,
  SerializedIndex,
  SerializedRecord,
} from "./types.js";

export const VERSION = "0.1.0";
const INDEX_FORMAT_VERSION = 1;

export type * from "./types.js";

interface IndexedEntry {
  fields: Map<string, FingerprintRecord>;
}

function isFingerprintRecord(value: unknown): value is FingerprintRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    "fingerprint" in value &&
    (value as FingerprintRecord).fingerprint instanceof Uint32Array
  );
}

function resolveQuery(
  query: string | Fingerprint | FingerprintRecord,
  hashOptions?: HashOptions,
): { fingerprint: Fingerprint; featureCount?: number } {
  if (typeof query === "string") {
    const record = hash(query, hashOptions);
    return { fingerprint: record.fingerprint, featureCount: record.featureCount };
  }
  if (query instanceof Uint32Array) {
    return { fingerprint: Fingerprint.fromArray(query) };
  }
  if (isFingerprintRecord(query)) {
    return {
      fingerprint: Fingerprint.fromArray(query.fingerprint),
      featureCount: query.featureCount,
    };
  }
  throw new TypeError("Query must be a string, Fingerprint, or FingerprintRecord");
}

function serializeRecord(record: FingerprintRecord): SerializedRecord {
  return {
    version: record.version,
    fingerprint: Array.from(record.fingerprint),
    featureCount: record.featureCount,
    createdAt: record.createdAt,
  };
}

function deserializeRecord(raw: SerializedRecord): FingerprintRecord {
  return {
    version: raw.version,
    fingerprint: Fingerprint.fromArray(new Uint32Array(raw.fingerprint)),
    featureCount: raw.featureCount,
    createdAt: raw.createdAt,
  };
}

function buildIndex<T>(
  initialItems: readonly T[],
  options: IndexOptions<T> = {},
  precomputed?: SerializedEntry[],
): MotifIndex<T> {
  const keys: NormalizedKey<T>[] = normalizeKeys(options.keys);
  const weightMap = new Map<string, number>();
  for (const k of keys) {
    weightMap.set(k.name, k.weight);
  }

  const hashOpts: HashOptions | undefined = options.hash;
  const fpSize = hashOpts?.size ?? 128;
  const defaultMinSim = options.minSimilarity ?? 0.1;
  const bandConfig: LshBandOptions | ResolvedBands =
    options.lsh ?? optimalBands(Math.max(defaultMinSim, 0.2), fpSize);

  const items: T[] = [...initialItems];
  const entries: IndexedEntry[] = [];
  const lshBuckets = new Map<string, Set<number>>();

  function indexEntry(refIndex: number, entry: IndexedEntry): void {
    for (const record of entry.fields.values()) {
      for (const bandKey of record.fingerprint.bandKeys(bandConfig)) {
        let bucket = lshBuckets.get(bandKey);
        if (!bucket) {
          bucket = new Set<number>();
          lshBuckets.set(bandKey, bucket);
        }
        bucket.add(refIndex);
      }
    }
  }

  function rebuildBuckets(): void {
    lshBuckets.clear();
    for (let i = 0; i < entries.length; i++) {
      indexEntry(i, entries[i]);
    }
  }

  function createEntry(item: T): IndexedEntry {
    const extracted = extractFields(item, keys);
    const fields = new Map<string, FingerprintRecord>();
    for (const [fieldName, text] of Object.entries(extracted)) {
      fields.set(fieldName, hash(text, hashOpts));
    }
    return { fields };
  }

  if (precomputed) {
    for (let i = 0; i < items.length; i++) {
      const rawEntry = precomputed[i];
      if (rawEntry) {
        const fields = new Map<string, FingerprintRecord>();
        for (const [k, v] of Object.entries(rawEntry.fields)) {
          fields.set(k, deserializeRecord(v));
        }
        const entry = { fields };
        entries.push(entry);
        indexEntry(i, entry);
      } else {
        const entry = createEntry(items[i]);
        entries.push(entry);
        indexEntry(i, entry);
      }
    }
  } else {
    for (let i = 0; i < items.length; i++) {
      const entry = createEntry(items[i]);
      entries.push(entry);
      indexEntry(i, entry);
    }
  }

  const index: MotifIndex<T> = {
    get size() {
      return items.length;
    },

    get items() {
      return items;
    },

    search(query, searchOptions = {}) {
      const { fingerprint: queryFp, featureCount: queryFeatures } = resolveQuery(
        query,
        hashOpts,
      );

      const minSim = searchOptions.minSimilarity ?? defaultMinSim;
      const minContainment = searchOptions.minContainment ?? options.minContainment;
      const includeDetails = searchOptions.includeDetails ?? false;

      // Gather LSH candidates
      const candidateSet = new Set<number>();
      for (const bandKey of queryFp.bandKeys(bandConfig)) {
        const bucket = lshBuckets.get(bandKey);
        if (bucket) {
          for (const idx of bucket) {
            candidateSet.add(idx);
          }
        }
      }

      // If LSH yields no candidates (e.g. very low threshold), scan all entries
      const candidates =
        candidateSet.size > 0
          ? candidateSet
          : Array.from({ length: entries.length }, (_, i) => i);

      const results: SearchResult<T>[] = [];

      for (const refIndex of candidates) {
        const entry = entries[refIndex];
        if (!entry || entry.fields.size === 0) continue;

        let weightedSimSum = 0;
        let weightedContSum = 0;
        let totalWeight = 0;
        let hasContainment = false;
        const details: Record<string, ComparisonResult> = {};

        for (const [fieldName, record] of entry.fields) {
          const weight = weightMap.get(fieldName) ?? 1;
          const cmp = queryFp.compare(record.fingerprint);

          weightedSimSum += cmp.similarity * weight;
          if (cmp.containment !== undefined) {
            weightedContSum += cmp.containment * weight;
            hasContainment = true;
          }
          totalWeight += weight;

          if (includeDetails) {
            details[fieldName] = cmp;
          }
        }

        if (totalWeight === 0) continue;

        const similarity = weightedSimSum / totalWeight;
        const containment = hasContainment ? weightedContSum / totalWeight : undefined;

        if (similarity < minSim) continue;
        if (
          minContainment !== undefined &&
          (containment === undefined || containment < minContainment)
        ) {
          continue;
        }

        const result: SearchResult<T> = {
          item: items[refIndex],
          refIndex,
          similarity,
        };
        if (containment !== undefined) {
          result.containment = containment;
        }
        if (includeDetails) {
          result.details = details;
        }

        results.push(result);
      }

      results.sort((a, b) => b.similarity - a.similarity);

      if (searchOptions.limit !== undefined && searchOptions.limit >= 0) {
        return results.slice(0, searchOptions.limit);
      }

      return results;
    },

    add(...newItems) {
      for (const item of newItems) {
        const refIndex = items.length;
        items.push(item);
        const entry = createEntry(item);
        entries.push(entry);
        indexEntry(refIndex, entry);
      }
      return index;
    },

    remove(predicate) {
      let removed = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        if (predicate(items[i], i)) {
          items.splice(i, 1);
          entries.splice(i, 1);
          removed++;
        }
      }
      if (removed > 0) {
        rebuildBuckets();
      }
      return removed;
    },

    export() {
      return {
        version: INDEX_FORMAT_VERSION,
        hash: hashOpts,
        lsh: options.lsh,
        entries: entries.map((entry) => {
          const fields: Record<string, SerializedRecord> = {};
          for (const [k, v] of entry.fields) {
            fields[k] = serializeRecord(v);
          }
          return { fields };
        }),
      };
    },
  };

  return index;
}

export function createIndex<T>(
  items: readonly T[],
  options?: IndexOptions<T>,
): MotifIndex<T> {
  return buildIndex(items, options);
}

export function loadIndex<T>(
  serialized: SerializedIndex,
  items: readonly T[],
  options?: IndexOptions<T>,
): MotifIndex<T> {
  if (serialized.version !== INDEX_FORMAT_VERSION) {
    throw new Error(`Unsupported serialized index version: ${serialized.version}`);
  }
  return buildIndex(
    items,
    {
      ...options,
      hash: options?.hash ?? serialized.hash,
      lsh: options?.lsh ?? serialized.lsh,
    },
    serialized.entries,
  );
}
