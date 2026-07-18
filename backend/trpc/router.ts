import { router } from './context';
import { projectsRouter } from './routers/projects';
import { tasksRouter } from './routers/tasks';
import { runsRouter } from './routers/runs';
import { patchesRouter } from './routers/patches';
import { agentRouter } from './routers/agent';

export const appRouter = router({
  projects: projectsRouter,
  tasks: tasksRouter,
  runs: runsRouter,
  patches: patchesRouter,
  agent: agentRouter,
});

// Export type for client-side type inference
export type AppRouter = typeof appRouter;
