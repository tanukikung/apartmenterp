type RoomListPage<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type RoomListResponse<T> = {
  success: boolean;
  data: RoomListPage<T>;
  error?: {
    message?: string;
  };
};

export const ROOMS_API_MAX_PAGE_SIZE = 300;

export async function fetchAllRooms<T>(
  filters: Record<string, string | number | null | undefined> = {},
): Promise<T[]> {
  const items: T[] = [];
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });

  let page = 1;
  let totalPages = 1;

  do {
    params.set('page', String(page));
    params.set('pageSize', String(ROOMS_API_MAX_PAGE_SIZE));

    const res = await fetch(`/api/rooms?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error('Failed to fetch rooms');
    }

    const json = (await res.json()) as RoomListResponse<T>;
    if (!json.success) {
      throw new Error(json.error?.message ?? 'Request failed');
    }

    const payload = json.data;
    items.push(...payload.data);
    totalPages = Math.max(payload.totalPages || 1, 1);
    page += 1;
  } while (page <= totalPages);

  return items;
}
