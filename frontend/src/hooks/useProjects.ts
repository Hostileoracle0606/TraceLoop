import { trpc } from '../lib/trpc';

export function useProjects() {
  const query = trpc.projects.list.useQuery();

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useProject(id: string | undefined) {
  const query = trpc.projects.get.useQuery(
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
