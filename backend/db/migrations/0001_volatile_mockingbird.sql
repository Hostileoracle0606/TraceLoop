ALTER TABLE "boards" ADD COLUMN "slug" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "agent_runtime_default" varchar(16) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "agent_runtime" varchar(16) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "boards_slug_unique_idx" ON "boards" USING btree ("slug");