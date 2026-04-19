/**
 * Shared pagination parser.
 *
 * All list endpoints MUST cap pageSize to prevent denial-of-service from a
 * single caller requesting the whole table.
 *
 * Usage:
 *   const { page, pageSize, skip, take } = parsePagination(req);
 *   // or with custom cap:
 *   const { page, pageSize, skip, take } = parsePagination(req, { max: 200 });
 */

export interface PaginationOptions {
  /** Maximum allowed pageSize. Default 100. */
  max?: number;
  /** Default pageSize when not supplied. Default 20. */
  defaultSize?: number;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

const DEFAULT_MAX = 100;
const DEFAULT_SIZE = 20;

export function parsePagination(
  req: Request | { url: string },
  opts: PaginationOptions = {}
): PaginationResult {
  const max = opts.max ?? DEFAULT_MAX;
  const defaultSize = opts.defaultSize ?? DEFAULT_SIZE;

  const url = new URL(req.url);
  const rawPage = Number(url.searchParams.get('page') ?? '1');
  const rawSize = Number(url.searchParams.get('pageSize') ?? String(defaultSize));

  // Guard against NaN, negative, zero, and overflow
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize > 0
    ? Math.min(Math.floor(rawSize), max)
    : defaultSize;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}
