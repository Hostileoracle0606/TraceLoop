import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, varchar, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// Projects
// ============================================================================

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(), // Supabase auth user ID
  name: text('name').notNull(),
  description: text('description'),
  boardId: uuid('board_id').references(() => boards.id),
  agentRuntimeDefault: varchar('agent_runtime_default', { length: 16 }).notNull().default('legacy'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('projects_user_id_idx').on(table.userId),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  board: one(boards, { fields: [projects.boardId], references: [boards.id] }),
  tasks: many(tasks),
}));

// ============================================================================
// Boards (platforms)
// ============================================================================

export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 64 }).notNull(),
  mcu: text('mcu').notNull(),
  architecture: text('architecture').notNull(),
  memoryFlash: integer('memory_flash').notNull(), // in KB
  memoryRam: integer('memory_ram').notNull(), // in KB
  platformFile: text('platform_file'), // Renode .repl file path
  peripherals: jsonb('peripherals').$type<string[]>().notNull(), // ['GPIO', 'UART', 'Timers', ...]
  buildTarget: text('build_target').notNull(), // Zephyr board target (e.g., 'stm32f4_disco')
  devicetreePath: text('devicetree_path'), // path to the board's .dts file
  ledMappings: jsonb('led_mappings').$type<Array<{name: string, color: string, gpioPort: string, pin: number}>>(),
  gpioPorts: jsonb('gpio_ports').$type<string[]>(),
  timerCount: integer('timer_count'),
  hasBLE: boolean('has_ble').default(false),
  hasWiFi: boolean('has_wifi').default(false),
  renodePlatformDescription: text('renode_platform_description'), // .repl file path in Renode's platform directory
  verified: boolean('verified').default(false),
  status: varchar('status', { length: 16 }).default('active'), // active, deprecated, beta
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  nameUniqueIdx: uniqueIndex('boards_name_unique_idx').on(table.name),
  slugUniqueIdx: uniqueIndex('boards_slug_unique_idx').on(table.slug),
}));

export const boardsRelations = relations(boards, ({ many }) => ({
  projects: many(projects),
}));

// ============================================================================
// Tasks (authoring sessions)
// ============================================================================

export type TaskStatus = 
  | 'clarification-needed'
  | 'planning'
  | 'editing'
  | 'building'
  | 'simulating'
  | 'analyzing'
  | 'patching'
  | 'rerunning'
  | 'completed'
  | 'blocked'
  | 'stopped';

export type PermissionProfile = 'review' | 'guided' | 'autonomous';

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  userId: uuid('user_id').notNull(),
  
  // Intent and requirements
  intent: text('intent').notNull(), // User's natural language description
  acceptanceCriteria: jsonb('acceptance_criteria').$type<{
    name: string;
    register: string;
    expect: string;
    byTime: number;
  }[]>().notNull(),
  
  // State machine
  status: varchar('status', { length: 32 }).notNull().default('planning'),
  iteration: integer('iteration').notNull().default(0),
  
  // Permission profile
  permissionProfile: varchar('permission_profile', { length: 16 }).notNull().default('guided'),
  
  // Agent runtime (pinned at creation; never changes mid-task — C4)
  agentRuntime: varchar('agent_runtime', { length: 16 }).notNull().default('legacy'),
  
  // Resource controls
  maxIterations: integer('max_iterations').notNull().default(5),
  maxTimeMs: integer('max_time_ms').notNull().default(1800000), // 30 min
  maxCostUsd: integer('max_cost_usd').notNull().default(500), // $5.00 in cents
  
  // Current source files (snapshot)
  currentFiles: jsonb('current_files').$type<Record<string, string>>(),
  
  // Timestamps
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('tasks_project_id_idx').on(table.projectId),
  userIdIdx: index('tasks_user_id_idx').on(table.userId),
  statusIdx: index('tasks_status_idx').on(table.status),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  runs: many(runs),
  patches: many(patches),
  activityLogs: many(activityLogs),
}));

// ============================================================================
// Runs (build + simulate + analyze)
// ============================================================================

export type RunStatus = 'pending' | 'building' | 'simulating' | 'analyzing' | 'passed' | 'failed' | 'error' | 'cancelled';

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  iteration: integer('iteration').notNull(),
  
  // Status
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  
  // Build
  buildOk: boolean('build_ok'),
  buildLog: text('build_log'),
  buildStartedAt: timestamp('build_started_at'),
  buildCompletedAt: timestamp('build_completed_at'),
  
  // Simulation
  traceLog: text('trace_log'),
  simStartedAt: timestamp('sim_started_at'),
  simCompletedAt: timestamp('sim_completed_at'),
  
  // Analysis
  analysisResult: jsonb('analysis_result').$type<{
    status: 'passed' | 'failed';
    rootCause?: {
      time: number;
      type: string;
      source: string;
      register: string;
      value: string;
      detail: string;
      label: string;
      lane: string;
    };
    chain?: Array<{
      id: string;
      label: string;
      lane: string;
      taxonomy: string;
      time: number;
      register: string;
      value: string;
      detail: string;
    }>;
    rootCauseText?: string;
  }>(),
  analysisCompletedAt: timestamp('analysis_completed_at'),
  
  // Resource usage
  elapsedMs: integer('elapsed_ms'),
  costUsd: integer('cost_usd'), // in cents
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  taskIdIdx: index('runs_task_id_idx').on(table.taskId),
  statusIdx: index('runs_status_idx').on(table.status),
}));

export const runsRelations = relations(runs, ({ one }) => ({
  task: one(tasks, { fields: [runs.taskId], references: [tasks.id] }),
}));

// ============================================================================
// Patches
// ============================================================================

export type PatchStatus = 'proposed' | 'approved' | 'rejected' | 'edited';

export const patches = pgTable('patches', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  runId: uuid('run_id').references(() => runs.id), // The run that triggered this patch
  
  // Patch content
  file: text('file').notNull(),
  before: text('before').notNull(),
  after: text('after').notNull(),
  summary: text('summary').notNull(),
  
  // Files after patch
  filesAfterPatch: jsonb('files_after_patch').$type<Record<string, string>>().notNull(),
  
  // Status
  status: varchar('status', { length: 16 }).notNull().default('proposed'),
  
  // Approval
  approvedBy: uuid('approved_by'), // User ID who approved
  approvedAt: timestamp('approved_at'),
  rejectionReason: text('rejection_reason'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  taskIdIdx: index('patches_task_id_idx').on(table.taskId),
  statusIdx: index('patches_status_idx').on(table.status),
}));

export const patchesRelations = relations(patches, ({ one }) => ({
  task: one(tasks, { fields: [patches.taskId], references: [tasks.id] }),
  run: one(runs, { fields: [patches.runId], references: [runs.id] }),
}));

// ============================================================================
// Activity Logs (audit trail)
// ============================================================================

export type ActivityActor = 'user' | 'agent' | 'system';

export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  
  // State transition
  fromState: varchar('from_state', { length: 32 }),
  toState: varchar('to_state', { length: 32 }).notNull(),
  reason: varchar('reason', { length: 64 }).notNull(),
  
  // Actor
  actor: varchar('actor', { length: 16 }).notNull(),
  userId: uuid('user_id'), // Present if actor is 'user'
  
  // Context
  iteration: integer('iteration'),
  metadata: jsonb('metadata'), // Additional context
  
  // Timestamp
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  taskIdIdx: index('activity_logs_task_id_idx').on(table.taskId),
  createdAtIdx: index('activity_logs_created_at_idx').on(table.createdAt),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  task: one(tasks, { fields: [activityLogs.taskId], references: [tasks.id] }),
}));

// ============================================================================
// Type exports
// ============================================================================

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

export type Patch = typeof patches.$inferSelect;
export type NewPatch = typeof patches.$inferInsert;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
