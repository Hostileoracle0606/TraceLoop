import { trpc } from '../lib/trpc';

export function useTasks(projectId: string | undefined) {
  const query = trpc.tasks.listByProject.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId },
  );

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useTask(id: string | undefined) {
  const query = trpc.tasks.get.useQuery(
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
