import { z } from "zod";

export type QueryReader = (key: string) => string | undefined;

export interface PaginationDefaults {
  defaultLimit: number;
  maxLimit: number;
  defaultPage?: number;
}

const positiveIntFromQuery = (fallback: number, max?: number) =>
  z.coerce
    .number()
    .int()
    .positive()
    .catch(fallback)
    .transform((value) => (max === undefined ? value : Math.min(value, max)));

export const parsePagination = (
  query: QueryReader,
  { defaultLimit, maxLimit, defaultPage = 1 }: PaginationDefaults,
): { limit: number; page: number; offset: number } => {
  const limit = positiveIntFromQuery(defaultLimit, maxLimit).parse(query("limit"));
  const page = positiveIntFromQuery(defaultPage).parse(query("page"));
  return {
    limit,
    page,
    offset: (page - 1) * limit,
  };
};

export const parseLimit = (
  query: QueryReader,
  { defaultLimit, maxLimit }: Omit<PaginationDefaults, "defaultPage">,
): number => positiveIntFromQuery(defaultLimit, maxLimit).parse(query("limit"));

export const parseOffsetPagination = (
  query: QueryReader,
  { defaultLimit, maxLimit }: Omit<PaginationDefaults, "defaultPage">,
): { limit: number; offset: number } => {
  const limit = parseLimit(query, { defaultLimit, maxLimit });
  const offset = z.coerce.number().int().min(0).catch(0).parse(query("offset"));
  return { limit, offset };
};

export const parseEnumQuery = <const T extends readonly [string, ...string[]]>(
  raw: string | undefined,
  values: T,
  fallback: T[number],
): T[number] => z.enum(values).catch(fallback).parse(raw);

export const parseOptionalEnumQuery = <const T extends readonly [string, ...string[]]>(
  raw: string | undefined,
  values: T,
): T[number] | undefined => {
  if (raw === undefined || raw === "") return undefined;
  const parsed = z.enum(values).safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};

export const parseOptionalFiniteNumber = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw === "") return undefined;
  const parsed = z.coerce.number().finite().safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};
