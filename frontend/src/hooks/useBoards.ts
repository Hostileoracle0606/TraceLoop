export interface Board {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

const MOCK_BOARDS: Board[] = [
  {
    id: 'mock-board-1',
    name: 'Default Board',
    description: 'Placeholder board — will be replaced with live data',
    createdAt: new Date().toISOString(),
  },
];

/**
 * Placeholder hook — returns mock board data until the boards tRPC router exists.
 * Replace with trpc.boards.list.useQuery() once available.
 */
export function useBoards() {
  return {
    data: MOCK_BOARDS,
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  };
}
