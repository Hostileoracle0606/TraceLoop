CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"from_state" varchar(32),
	"to_state" varchar(32) NOT NULL,
	"reason" varchar(64) NOT NULL,
	"actor" varchar(16) NOT NULL,
	"user_id" uuid,
	"iteration" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"mcu" text NOT NULL,
	"architecture" text NOT NULL,
	"memory_flash" integer NOT NULL,
	"memory_ram" integer NOT NULL,
	"platform_file" text,
	"peripherals" jsonb NOT NULL,
	"build_target" text NOT NULL,
	"devicetree_path" text,
	"led_mappings" jsonb,
	"gpio_ports" jsonb,
	"timer_count" integer,
	"has_ble" boolean DEFAULT false,
	"has_wifi" boolean DEFAULT false,
	"renode_platform_description" text,
	"status" varchar(16) DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"run_id" uuid,
	"file" text NOT NULL,
	"before" text NOT NULL,
	"after" text NOT NULL,
	"summary" text NOT NULL,
	"files_after_patch" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'proposed' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"board_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"iteration" integer NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"build_ok" boolean,
	"build_log" text,
	"build_started_at" timestamp,
	"build_completed_at" timestamp,
	"trace_log" text,
	"sim_started_at" timestamp,
	"sim_completed_at" timestamp,
	"analysis_result" jsonb,
	"analysis_completed_at" timestamp,
	"elapsed_ms" integer,
	"cost_usd" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"intent" text NOT NULL,
	"acceptance_criteria" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'planning' NOT NULL,
	"iteration" integer DEFAULT 0 NOT NULL,
	"permission_profile" varchar(16) DEFAULT 'guided' NOT NULL,
	"max_iterations" integer DEFAULT 5 NOT NULL,
	"max_time_ms" integer DEFAULT 1800000 NOT NULL,
	"max_cost_usd" integer DEFAULT 500 NOT NULL,
	"current_files" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_task_id_idx" ON "activity_logs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "boards_name_unique_idx" ON "boards" USING btree ("name");--> statement-breakpoint
CREATE INDEX "patches_task_id_idx" ON "patches" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "patches_status_idx" ON "patches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "runs_task_id_idx" ON "runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_project_id_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");