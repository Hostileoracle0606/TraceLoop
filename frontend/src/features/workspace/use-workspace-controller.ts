import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '../../lib/trpc';
import {
  createImportedSession,
  createSchematicFromUpload,
  createSchematicTaskSession,
  getDemoConversations,
  getDemoProjects,
  getDemoSession,
  getSimulationProfiles,
} from './workspace-data';
import type {
  BoardSummary,
  ConversationSummary,
  InspectorTab,
  ProjectSummary,
  WorkspaceMode,
  WorkspaceSession,
} from './types';

type UploadState = 'idle' | 'reading' | 'building' | 'ready' | 'error';
export type WorkspacePhase = 'idle' | 'building' | 'ready' | 'thinking' | 'coding';
type HealthStatus = {
  status: 'ok' | 'degraded';
  checks: { supabase: 'ok' | 'error'; inngest: 'ok' | 'error' };
  timestamp: string;
};

const waitForPaint = (duration: number) => new Promise<void>((resolve) => window.setTimeout(resolve, duration));

const formatRelativeDate = (value: Date | string | null | undefined) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  const delta = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1_440)}d`;
};

const taskStateToStatus = (status: string): WorkspaceSession['status'] => {
  if (status === 'completed') return 'passed';
  if (status === 'blocked' || status === 'patching') return 'failed';
  return 'active';
};

export function useWorkspaceController() {
  const isGuestDemo = new URL(window.location.href).searchParams.get('demo') === '1';
  const [layoutMode, setLayoutModeState] = useState<WorkspaceMode>('chat');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('code');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('traceloop:sidebar-collapsed') === 'true');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [selectedFile, setSelectedFile] = useState('ecu-a/src/main.c');
  const [composerValue, setComposerValue] = useState('');
  const [localSession, setLocalSession] = useState<WorkspaceSession | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [workspacePhase, setWorkspacePhase] = useState<WorkspacePhase>('coding');
  const [hasAuthoredCode, setHasAuthoredCode] = useState(true);
  const phaseTimerRef = useRef<number | null>(null);
  const [taskId, setTaskId] = useState<string | null>(() => new URL(window.location.href).searchParams.get('task'));
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [patchActionError, setPatchActionError] = useState<string | null>(null);

  const projectsQuery = trpc.projects.list.useQuery(undefined, { enabled: !isGuestDemo, retry: false });
  const boardsQuery = trpc.boards.list.useQuery(undefined, { retry: false });
  const taskQuery = trpc.tasks.get.useQuery(
    { id: taskId! },
    { enabled: Boolean(taskId), refetchInterval: taskId ? 2_000 : false, retry: false },
  );
  const activityQuery = trpc.tasks.getActivityLog.useQuery(
    { taskId: taskId! },
    { enabled: Boolean(taskId), refetchInterval: taskId ? 2_000 : false, retry: false },
  );
  const patchesQuery = trpc.patches.listByTask.useQuery(
    { taskId: taskId! },
    { enabled: Boolean(taskId), refetchInterval: taskId ? 2_000 : false, retry: false },
  );
  const createProject = trpc.projects.create.useMutation();
  const createTask = trpc.tasks.create.useMutation();
  const planTask = trpc.agent.plan.useMutation();
  const stopTask = trpc.tasks.stop.useMutation();
  const approvePatchMutation = trpc.patches.approve.useMutation();
  const rejectPatchMutation = trpc.patches.reject.useMutation();

  useEffect(() => {
    let cancelled = false;
    const loadHealth = async () => {
      try {
        const response = await fetch('/api/health');
        const result = await response.json() as HealthStatus;
        if (!cancelled && result?.checks) setHealth(result);
      } catch {
        if (!cancelled) setHealth(null);
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    };
    void loadHealth();
    const interval = window.setInterval(loadHealth, 15_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  const projects = useMemo<ProjectSummary[]>(() => {
    if (isGuestDemo) return getDemoProjects();
    if (!projectsQuery.data?.length) return [];
    return projectsQuery.data.map((project) => ({
      id: project.id,
      name: project.name,
      source: project.boardName ? `${project.boardName} schematic` : 'Imported schematic',
      controllers: 1,
      updatedLabel: formatRelativeDate(project.updatedAt),
    }));
  }, [isGuestDemo, projectsQuery.data]);

  // Backend board profiles stay hidden behind the schematic-to-simulator adapter.
  const simulationProfiles = useMemo<BoardSummary[]>(() => {
    const templates = getSimulationProfiles();
    if (!boardsQuery.data?.length) return templates;
    const liveBoards = boardsQuery.data.map((board) => ({
      id: board.id,
      name: board.name,
      mcu: board.mcu,
      architecture: board.architecture,
      peripherals: board.peripherals,
      status: board.status ?? 'available',
    }));
    const additionalBoards = liveBoards.filter((liveBoard) => !templates.some((template) => (
      template.name === liveBoard.name || template.mcu === liveBoard.mcu
    )));
    return [...templates, ...additionalBoards];
  }, [boardsQuery.data]);

  useEffect(() => {
    window.localStorage.setItem('traceloop:sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => () => {
    if (phaseTimerRef.current !== null) window.clearTimeout(phaseTimerRef.current);
  }, []);

  const liveSession = useMemo<WorkspaceSession | null>(() => {
    const task = taskQuery.data;
    if (!task) return null;
    const fallback = getDemoSession();
    const files = task.currentFiles ?? {};
    const fileNames = Object.keys(files);
    const activity = activityQuery.data ?? [];
    const steps = activity.map((entry, index) => ({
      id: entry.id ?? `activity-${index}`,
      label: String(entry.toState).replaceAll('-', ' '),
      detail: String(entry.reason).replaceAll('-', ' '),
      state: entry.toState === 'blocked' ? 'failed' as const : entry.toState === task.status ? 'active' as const : 'complete' as const,
      duration: formatRelativeDate(entry.createdAt),
    }));
    const project = projectsQuery.data?.find((item) => item.id === task.projectId);
    const board = boardsQuery.data?.find((item) => item.id === project?.boardId);
    const latestRun = task.runs?.[0];
    const analysis = latestRun?.analysisResult;
    const rootCause = analysis?.rootCause;
    const evidence = rootCause ? [{
      id: 'root-cause',
      time: rootCause.time,
      label: rootCause.label,
      detail: rootCause.detail,
      register: rootCause.register,
      value: rootCause.value,
      tone: 'amber' as const,
    }] : [];
    const criterion = task.acceptanceCriteria[0];
    return {
      ...fallback,
      id: task.id,
      title: task.intent.length > 52 ? `${task.intent.slice(0, 52)}…` : task.intent,
      objective: task.intent,
      origin: 'live',
      status: taskStateToStatus(task.status),
      iteration: task.iteration,
      permission: task.permissionProfile,
      files,
      activeFile: fileNames.includes(selectedFile) ? selectedFile : fileNames[0] ?? '',
      branch: 'Git not connected',
      boardName: project?.boardName ?? board?.name ?? 'Configured board',
      schematic: {
        ...fallback.schematic,
        id: `board-${project?.boardId ?? 'unknown'}`,
        fileName: project?.boardName ?? board?.name ?? 'Configured board',
        displayName: project?.name ?? 'Firmware project',
        format: 'Board target',
        fileSize: '',
        componentCount: 0,
        controllerCount: 1,
        buses: board?.peripherals ?? [],
        nodes: [],
        links: [],
      },
      steps,
      evidence,
      testSummary: {
        passed: task.status === 'completed' ? task.acceptanceCriteria.length : 0,
        total: task.acceptanceCriteria.length,
        assertion: criterion?.name ?? 'No acceptance criterion',
        expected: criterion ? `${criterion.register} = ${criterion.expect} by ${criterion.byTime} µs` : 'Not available',
        observed: analysis?.rootCauseText ?? (task.status === 'completed' ? 'All criteria passed' : 'Awaiting run evidence'),
      },
    };
  }, [activityQuery.data, boardsQuery.data, projectsQuery.data, selectedFile, taskQuery.data]);

  const session = localSession ?? liveSession ?? getDemoSession();
  const currentPatch = patchesQuery.data?.find((patch) => patch.status === 'proposed') ?? patchesQuery.data?.[0] ?? null;

  useEffect(() => {
    if (!session.files[selectedFile]) setSelectedFile(session.activeFile);
  }, [selectedFile, session.activeFile, session.files]);

  const conversations = useMemo<ConversationSummary[]>(() => {
    const demos = getDemoConversations();
    if (!liveSession) return localSession
      ? [{
          id: localSession.id,
          projectId: 'local',
          title: localSession.title,
          preview: localSession.objective ? 'Agent is preparing the firmware' : 'Virtual system ready for a goal',
          status: localSession.status,
          updatedLabel: 'Now',
        }, ...demos.filter((item) => item.id !== localSession.id)]
      : demos;
    return [
      {
        id: liveSession.id,
        projectId: taskQuery.data?.projectId ?? 'live',
        title: liveSession.title,
        preview: liveSession.steps[0]?.detail ?? 'Active task',
        status: liveSession.status,
        updatedLabel: 'Now',
      },
      ...demos,
    ];
  }, [liveSession, localSession, taskQuery.data?.projectId]);

  const startNewTask = useCallback(() => {
    setLayoutModeState('chat');
    setIsDraft(true);
    setLocalSession(null);
    setComposerValue('');
    setSubmitError(null);
    setUploadState('idle');
    setUploadFileName('');
    setUploadError(null);
    setWorkspacePhase('idle');
    setHasAuthoredCode(false);
    if (phaseTimerRef.current !== null) window.clearTimeout(phaseTimerRef.current);
    setSidebarOpen(false);
    setInspectorOpen(false);
  }, []);

  const openConversation = useCallback((conversationId: string) => {
    setIsDraft(false);
    setLayoutModeState('chat');
    setComposerValue('');
    setSubmitError(null);
    setSidebarOpen(false);
    setInspectorOpen(false);
    setWorkspacePhase('coding');
    setHasAuthoredCode(true);
    if (phaseTimerRef.current !== null) window.clearTimeout(phaseTimerRef.current);
    if (conversationId.startsWith('demo-')) {
      const demo = getDemoSession(conversationId);
      setTaskId(null);
      setLocalSession(demo);
      setSelectedFile(demo.activeFile);
      const url = new URL(window.location.href);
      url.searchParams.delete('task');
      window.history.replaceState({}, '', url);
    }
  }, []);

  const uploadSchematic = useCallback(async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      setUploadState('error');
      setUploadError('That file is larger than 25 MB. Export a single schematic sheet or a compressed PDF.');
      return;
    }

    setUploadFileName(file.name);
    setUploadError(null);
    setUploadState('reading');
    try {
      const textLike = /\.(kicad_sch|sch|json|net|svg)$/i.test(file.name) || file.type.startsWith('text/');
      const text = textLike && file.size < 2 * 1024 * 1024 ? await file.text() : '';
      await waitForPaint(420);
      const schematic = createSchematicFromUpload({ name: file.name, size: file.size, type: file.type, text });
      const imported = createImportedSession(schematic);
      setUploadState('building');
      setWorkspacePhase('building');
      setHasAuthoredCode(false);
      setLocalSession(imported);
      setSelectedFile(imported.activeFile);
      setComposerValue('');
      setIsDraft(false);
      setLayoutModeState('workbench');
      setSidebarCollapsed(true);
      setInspectorOpen(false);
      await waitForPaint(2_100);
      setWorkspacePhase('ready');
      setUploadState('ready');
    } catch (error) {
      setUploadState('error');
      setUploadError(error instanceof Error ? error.message : 'TraceLoop could not read this schematic.');
    }
  }, []);

  const submitPrompt = useCallback(async () => {
    const objective = composerValue.trim();
    if (!objective || isSubmitting) return;
    setSubmitError(null);
    setIsSubmitting(true);

    if (localSession && (localSession.origin === 'upload' || localSession.origin === 'example')) {
      setLocalSession(createSchematicTaskSession(objective, localSession));
      setComposerValue('');
      setIsDraft(false);
      setWorkspacePhase('thinking');
      if (phaseTimerRef.current !== null) window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = window.setTimeout(() => {
        setWorkspacePhase('coding');
        setHasAuthoredCode(true);
        setIsSubmitting(false);
      }, 1_850);
      return;
    }

    const controllerNames = session.schematic.nodes
      .filter((node) => node.kind === 'controller' || node.kind === 'radio')
      .map((node) => node.name);
    const board = simulationProfiles.find((profile) => controllerNames.some((name) => name.includes(profile.mcu) || profile.mcu.includes(name))) ?? simulationProfiles[0];
    if (!board) {
      setSubmitError('No compatible simulation profile is available for this schematic yet.');
      setIsSubmitting(false);
      return;
    }

    // The preview keeps imported files local; authenticated workspaces continue
    // through the existing backend using the compatible profile chosen above.
    if (board.id.startsWith('demo-') || projectsQuery.error) {
      setLocalSession(createSchematicTaskSession(objective, session));
      setComposerValue('');
      setIsDraft(false);
      setWorkspacePhase('thinking');
      if (phaseTimerRef.current !== null) window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = window.setTimeout(() => {
        setWorkspacePhase('coding');
        setHasAuthoredCode(true);
        setIsSubmitting(false);
      }, 1_850);
      return;
    }

    try {
      setWorkspacePhase('thinking');
      const project = await createProject.mutateAsync({
        name: session.schematic.displayName,
        description: objective,
        boardId: board.id,
      });
      const task = await createTask.mutateAsync({
        projectId: project.id,
        intent: objective,
        acceptanceCriteria: [{
          name: 'Behavior described in chat',
          register: 'SYSTEM_TRACE',
          expect: objective.slice(0, 100),
          byTime: 2_000,
        }],
        permissionProfile: 'guided',
      });
      await planTask.mutateAsync({ taskId: task.id });
      setWorkspacePhase('coding');
      setHasAuthoredCode(true);
      setTaskId(task.id);
      setComposerValue('');
      setIsDraft(false);
      const url = new URL(window.location.href);
      url.searchParams.set('task', task.id);
      window.history.replaceState({}, '', url);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not start the task');
      setWorkspacePhase('ready');
    } finally {
      setIsSubmitting(false);
    }
  }, [composerValue, createProject, createTask, isSubmitting, localSession, planTask, projectsQuery.error, session, simulationProfiles]);

  const approvePatch = useCallback(async () => {
    if (!currentPatch || currentPatch.status !== 'proposed') return;
    setPatchActionError(null);
    try {
      await approvePatchMutation.mutateAsync({ id: currentPatch.id });
      await Promise.all([taskQuery.refetch(), patchesQuery.refetch(), activityQuery.refetch()]);
    } catch (error) {
      setPatchActionError(error instanceof Error ? error.message : 'Could not approve the patch');
    }
  }, [activityQuery, approvePatchMutation, currentPatch, patchesQuery, taskQuery]);

  const rejectPatch = useCallback(async () => {
    if (!currentPatch || currentPatch.status !== 'proposed') return;
    setPatchActionError(null);
    try {
      await rejectPatchMutation.mutateAsync({ id: currentPatch.id, reason: 'Changes requested from patch review' });
      await Promise.all([taskQuery.refetch(), patchesQuery.refetch(), activityQuery.refetch()]);
    } catch (error) {
      setPatchActionError(error instanceof Error ? error.message : 'Could not reject the patch');
    }
  }, [activityQuery, currentPatch, patchesQuery, rejectPatchMutation, taskQuery]);

  const stop = useCallback(() => {
    if (taskId) stopTask.mutate({ taskId });
  }, [stopTask, taskId]);

  const setLayoutMode = useCallback((mode: WorkspaceMode) => {
    setLayoutModeState(mode);
    setInspectorOpen(false);
    if (mode === 'workbench') setSidebarCollapsed(true);
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);

  return {
    layoutMode,
    setLayoutMode,
    inspectorTab,
    setInspectorTab,
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    inspectorOpen,
    setInspectorOpen,
    isDraft,
    projects,
    conversations,
    session,
    task: taskQuery.data ?? null,
    currentPatch,
    patchActionError,
    approvePatch,
    rejectPatch,
    patchActionPending: approvePatchMutation.isPending || rejectPatchMutation.isPending,
    selectedFile,
    setSelectedFile,
    composerValue,
    setComposerValue,
    submitPrompt,
    submitError,
    isSubmitting,
    uploadState,
    uploadFileName,
    uploadError,
    uploadSchematic,
    workspacePhase,
    hasAuthoredCode,
    startNewTask,
    openConversation,
    stop,
    hasLiveTask: Boolean(taskId),
    stopPending: stopTask.isPending,
    isGuestDemo,
    canUseWorkbench: session.origin === 'example',
    health,
    systemStatus: healthLoading ? 'Checking systems' : health?.status === 'ok' ? 'Core services ready' : 'Core services unavailable',
  };
}

export type WorkspaceController = ReturnType<typeof useWorkspaceController>;
