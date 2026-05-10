import { useState, useCallback, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface TableFilter {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
  value: any;
}

export interface TableState {
  page: number;
  pageSize: number;
  sortField: string | null;
  sortDirection: SortDirection;
  filters: TableFilter[];
  selectedRows: Set<string>;
}

export interface TableActions {
  goToPage(page: number): void;
  setPageSize(size: number): void;
  sort(field: string): void;
  addFilter(filter: TableFilter): void;
  removeFilter(field: string): void;
  clearFilters(): void;
  toggleRow(rowId: string): void;
  selectAll(rowIds: string[]): void;
  clearSelection(): void;
  reset(): void;
}

const defaultState: TableState = {
  page: 0,
  pageSize: 10,
  sortField: null,
  sortDirection: null,
  filters: [],
  selectedRows: new Set(),
};

export function useTableState(
  initialState: Partial<TableState> = {}
): TableState & TableActions {
  const [state, setState] = useState<TableState>({
    ...defaultState,
    ...initialState,
  });

  const goToPage = useCallback((page: number) => {
    setState((prev) => ({ ...prev, page: Math.max(0, page) }));
  }, []);

  const setPageSize = useCallback((size: number) => {
    setState((prev) => ({ ...prev, pageSize: Math.max(1, size), page: 0 }));
  }, []);

  const sort = useCallback((field: string) => {
    setState((prev) => {
      if (prev.sortField === field) {
        // Cycle through: asc → desc → null
        const nextDirection: SortDirection =
          prev.sortDirection === 'asc' ? 'desc' : prev.sortDirection === 'desc' ? null : 'asc';
        return {
          ...prev,
          sortField: nextDirection ? field : null,
          sortDirection: nextDirection,
        };
      }
      return { ...prev, sortField: field, sortDirection: 'asc' };
    });
  }, []);

  const addFilter = useCallback((filter: TableFilter) => {
    setState((prev) => {
      const newFilters = prev.filters.filter((f) => f.field !== filter.field);
      return {
        ...prev,
        filters: [...newFilters, filter],
        page: 0,
      };
    });
  }, []);

  const removeFilter = useCallback((field: string) => {
    setState((prev) => ({
      ...prev,
      filters: prev.filters.filter((f) => f.field !== field),
      page: 0,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setState((prev) => ({
      ...prev,
      filters: [],
      page: 0,
    }));
  }, []);

  const toggleRow = useCallback((rowId: string) => {
    setState((prev) => {
      const newSelected = new Set(prev.selectedRows);
      if (newSelected.has(rowId)) {
        newSelected.delete(rowId);
      } else {
        newSelected.add(rowId);
      }
      return { ...prev, selectedRows: newSelected };
    });
  }, []);

  const selectAll = useCallback((rowIds: string[]) => {
    setState((prev) => ({
      ...prev,
      selectedRows: new Set(rowIds),
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedRows: new Set(),
    }));
  }, []);

  const reset = useCallback(() => {
    setState(defaultState);
  }, []);

  return useMemo(
    () => ({
      ...state,
      goToPage,
      setPageSize,
      sort,
      addFilter,
      removeFilter,
      clearFilters,
      toggleRow,
      selectAll,
      clearSelection,
      reset,
    }),
    [state, goToPage, setPageSize, sort, addFilter, removeFilter, clearFilters, toggleRow, selectAll, clearSelection, reset]
  );
}
