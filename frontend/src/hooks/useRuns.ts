import { trpc } from '../lib/trpc';

export function useRuns(taskId: string | undefined) {
  const query = trpc.runs.listByTask.useQuery(
    { taskId: taskId! },
    { enabled: !!taskId },
  );

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useRun(id: string | undefined) {
  const query = trpc.runs.get.useQuery(
    { id: id! },
    { enabled: !!id },
  );

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
