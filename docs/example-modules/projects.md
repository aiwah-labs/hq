# Projects & Tasks — example module

A realistic example module that shows how Object Studio, custom actions, the
policy engine, workflows, and agents all compose on a single domain. Two
Prisma models, eight custom actions, two workflows, two agents, and a seed
with enough data to make every surface non-empty on a fresh clone.

## What it ships

| Kind | Name | Notes |
|---|---|---|
| Object | `Project` | Name, summary, status, priority, owner, dates |
| Object | `Task` | Title, status, priority, assignee, due date, blocked reason |
| Action | `project.stats` | Rolled-up task counts + completion % |
| Action | `project.summarize` | Deterministic markdown rollup |
| Action | `project.createStatusUpdate` | Append dated update to project summary |
| Action | `task.listBlocked` | Tasks currently in BLOCKED status |
| Action | `task.listOverdue` | Tasks past due date and not DONE/CANCELLED |
| Action | `task.assign` | Set/clear assignee |
| Action | `task.markBlocked` | Move to BLOCKED with required reason |
| Action | `task.complete` | Mark DONE + clear blocked reason |
| Workflow | `projects.weekly-status-digest` | Weekly cron digest across projects |
| Workflow | `projects.stale-review` | Daily surface of projects stale > 14d |
| Agent | `projects-ops-assistant` | Conversational — answers status questions |
| Agent | `projects-status-reporter` | Scheduled — compiles digest every Monday |
| Skill | `projects` | Bundles the actions above for agent use |
| Seed | `seed-modules/projects-tasks.ts` | 4 projects, 18 tasks, blocked + overdue mix |

## How it uses the platform

- **Ownership-aware permissions.** `Project` sets `ownership: { ownerField: 'ownerUserId' }` and `Task` sets `ownership: { assigneeField: 'assigneeUserId' }`. MEMBER users see all records on reads but only their own records on writes (scoped at the CRUD layer).
- **Default permission keys.** Actions grant on `project.read|write|create|update|delete|bulk` and `task.*`. Override in the module file if you want a shared `projects.*` namespace.
- **Events fire automatically.** Because both objects set `events: true`, `project.created`, `task.updated`, etc. are emitted by the CRUD runtime. Wire workflow triggers on them when you need reactive automation.
- **Action dispatcher first.** The workflows and agents call actions through `dispatchAction`, so the policy engine validates both scope and ownership on every call — the agent surface follows the same rules as the UI.

## Adapt this example

- **Rename to your domain.** In many businesses a "project" is really an engagement, case, campaign, or build. Replace with your real tier-1 delivery entity.
- **Add sub-tasks.** Drop a `parentTaskId` self-relation on `Task` and update the field to `relation` with `target: 'Task'`. The Object Studio renders nested pickers automatically.
- **Custom statuses.** Replace the `ProjectStatus` and `TaskStatus` enums to match your team's language (e.g. "Discovery / Execution / Retro"). Keep `DONE` and `CANCELLED` as terminal states so the overdue/blocked counters work.
- **Hook the digest to Slack.** The workflow's `compile-digest` step returns a markdown blob. Add a `notify.slack` action as the next node and wire it in.
- **Plug in a real reassignment UI.** `task.assign` is the canonical action; build a shortcut into your inbox or messaging surface that calls it.

## Remove this example

1. Delete `shared/objects/src/modules/projects-tasks.ts` and remove the `...projectsTasksObjects` spread in `shared/objects/src/modules/index.ts`.
2. Delete `shared/actions/src/custom/projects/` and the matching `import './custom/projects/index.js'` line in `shared/actions/src/index.ts`.
3. Delete `shared/workflows/src/workflows/projects/` and remove the imports from `shared/workflows/src/workflows/index.ts`.
4. Delete `shared/agents/src/agents/projects/` and remove the imports from `shared/agents/src/agents/index.ts`.
5. Delete `shared/agents/src/skill-definitions/projects.skill.ts` and remove its re-export in `shared/agents/src/skill-definitions/index.ts`.
6. Delete `shared/db/src/seed-modules/projects-tasks.ts` and its entry in `shared/db/src/seed-modules/index.ts`.
7. Remove `Project`, `Task`, `ProjectStatus`, `TaskStatus`, `TaskPriority` from `shared/db/prisma/schema.prisma`, and remove `ownedProjects` and `assignedTasks` from the `User` model. Run `pnpm db:migrate`.
8. Delete `apps/workshop/src/app/(app)/projects/` and the Projects entry in `apps/workshop/src/components/shell/Sidebar.tsx`.
9. Delete this file and the "projects" entry in `docs/example-modules/README.md`.

A clean grep after removal should return nothing for: `Project`, `Task`, `project.`, `task.`, `projectsTasksObjects`, `seedProjectsTasks`, `projects-ops-assistant`, `projects-status-reporter`.
