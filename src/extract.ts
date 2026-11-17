import type { KeyConfig, KeyPath } from "./types.js";

export interface NormalizedKey<T> {
  name: string;
  weight: number;
  getFn?: (item: T) => string | string[] | null | undefined;
}

export function normalizeKeys<T>(
  keys?: Array<KeyPath<T> | KeyConfig<T>>,
): NormalizedKey<T>[] {
  if (!keys || keys.length === 0) {
    return [];
  }

  return keys.map((key) => {
    if (typeof key === "string") {
      return { name: key, weight: 1 };
    }
    return {
      name: key.name,
      weight: key.weight ?? 1,
      getFn: key.getFn,
    };
  });
}

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const strings = value.filter((v): v is string => typeof v === "string");
    return strings.length > 0 ? strings.join(" ") : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

export function extractFields<T>(
  item: T,
  keys: readonly NormalizedKey<T>[],
): Record<string, string> {
  if (typeof item === "string") {
    return { $self: item };
  }

  if (keys.length === 0) {
    const text = toText(item);
    return text !== undefined ? { $self: text } : {};
  }

  const fields: Record<string, string> = {};
  for (const key of keys) {
    const raw = key.getFn ? key.getFn(item) : getByPath(item, key.name);
    const text = toText(raw);
    if (text !== undefined && text.length > 0) {
      fields[key.name] = text;
    }
  }

  return fields;
}
