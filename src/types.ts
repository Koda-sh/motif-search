import type {
  ComparisonResult,
  Fingerprint,
  FingerprintRecord,
  HashOptions,
  LshBandOptions,
} from "@koda.sh/motif-core";

/** Dot-notation path into an object type `T`, falling back to `string`. */
export type KeyPath<T> = T extends string
  ? string
  : T extends Record<string, unknown>
    ? {
        [K in keyof T & string]: T[K] extends Record<string, unknown>
          ? K | `${K}.${KeyPath<T[K]>}`
          : K;
      }[keyof T & string] | (string & {})
    : string;

export interface KeyConfig<T> {
  name: KeyPath<T>;
  weight?: number;
  getFn?: (item: T) => string | string[] | null | undefined;
}

export interface IndexOptions<T> {
  /** Fields to index. Supports dot-notation paths or weighted KeyConfig<T>. */
  keys?: Array<KeyPath<T> | KeyConfig<T>>;
  /** Fingerprinting options passed to motif-core. */
  hash?: HashOptions;
  /** LSH banding configuration for candidate retrieval. */
  lsh?: LshBandOptions;
  /** Minimum similarity (0.0 to 1.0) required to return a result. Default: 0.1 */
  minSimilarity?: number;
  /** Minimum containment (0.0 to 1.0) if feature counts are available. */
  minContainment?: number;
}

export interface SearchOptions {
  limit?: number;
  minSimilarity?: number;
  minContainment?: number;
  /** Include per-key ComparisonResult breakdown. Default: false */
  includeDetails?: boolean;
}

export interface SearchResult<T> {
  item: T;
  refIndex: number;
  /** Overall similarity score (0.0 to 1.0, higher = better). */
  similarity: number;
  /** Overall containment estimate (0.0 to 1.0), if available. */
  containment?: number;
  /** Per-key motif-core ComparisonResult, when includeDetails is true. */
  details?: Record<string, ComparisonResult>;
}

export interface SerializedRecord {
  version: number;
  fingerprint: number[];
  featureCount: number;
  createdAt: number;
}

export interface SerializedEntry {
  fields: Record<string, SerializedRecord>;
}

export interface SerializedIndex {
  version: number;
  hash?: HashOptions;
  lsh?: LshBandOptions;
  entries: SerializedEntry[];
}

export interface MotifIndex<T> {
  readonly size: number;
  readonly items: readonly T[];

  search(
    query: string | Fingerprint | FingerprintRecord,
    options?: SearchOptions,
  ): SearchResult<T>[];

  add(...items: readonly T[]): this;
  remove(predicate: (item: T, refIndex: number) => boolean): number;
  export(): SerializedIndex;
}
