/**
 * Seed — Bootstrap.
 *
 * Creates the initial welcome content that new users see when they open HQ
 * for the first time: inbox items explaining the platform and sample notes.
 * All writes are idempotent — keyed by slug/title so repeated seeds are safe.
 */
import type { db as Db } from '../client.js';

const WELCOME_NOTES = [
  {
    title: 'Welcome to HQ',
    slug: 'welcome-to-hq',
    isPinned: true,
    tags: ['setup', 'getting-started'],
    body: `# Welcome to HQ

HQ is your organisation's operating system. Everything — objects, workflows, agents, approvals — lives here.

## What to explore first

1. **Objects** — your data layer. Customers, products, projects: all built with the same schema-driven system. Edit, filter, and search any record.
2. **Demo App** — open it from the sidebar or from the Home dashboard. It shows a working product catalog so you can see how a real app feels on HQ.
3. **Workflows** — build automations without code. Trigger on object changes, agent events, or schedules.
4. **Agents** — AI workers you can assign tasks to. They hand off results to your inbox.
5. **Inbox** — your action centre. Approvals, task assignments, alerts, and handoffs all land here. Filter by *Needs Action* to focus.

## Customising this workspace

- **Add a module**: drop a file in \`shared/objects/src/modules/\` and register it in \`index.ts\`.
- **Add seed data**: add a seed file in \`shared/db/src/seed-modules/\` and register it.
- **Brand it**: update tokens in \`apps/designer/src/ui/tokens.ts\`.

Delete or archive this note once you've read it.`,
  },
  {
    title: 'How the inbox works',
    slug: 'how-the-inbox-works',
    isPinned: false,
    tags: ['inbox', 'workflow'],
    body: `# How the inbox works

The inbox is the single place where HQ surfaces anything that needs your attention.

## Item types

| Type | What it means |
|---|---|
| **Approval** | An agent or workflow needs you to sign off on an action |
| **Task** | A task has been assigned to you |
| **Failure** | A workflow run has failed |
| **Handoff** | An agent has completed work and is handing back to you |
| **Mention** | Someone or something referenced you |

## Filters

Use the filter tabs on the Home page to focus:

- **All** — everything in your inbox
- **Needs action** — approvals and task assignments that require a decision
- **Alerts** — workflow failures and system warnings
- **Updates** — informational items (handoffs, mentions)

## Approvals

When a workflow or agent requests approval, it creates an inbox item of type *Approval*. Click **View →** to open the approval detail page where you can approve or reject with a reason.`,
  },
  {
    title: 'Building your first workflow',
    slug: 'building-your-first-workflow',
    isPinned: false,
    tags: ['workflows', 'getting-started'],
    body: `# Building your first workflow

Workflows automate actions across your data. A workflow has:

- **Trigger** — what starts it (object created, cron schedule, manual)
- **Steps** — the actions to run (call an agent, update a record, send a notification)
- **Approvals** — optional gates where a human must sign off before the workflow continues

## Example: new customer onboarding

1. **Trigger**: Customer object created with status = ACTIVE
2. **Step 1**: Agent generates a personalised welcome email draft
3. **Approval**: Human reviews and approves the draft
4. **Step 2**: Email is sent via the email integration

## Tips

- Start simple — a one-step workflow that creates an inbox item is enough to validate the pattern.
- Use the *Runs* tab on any workflow to see what happened and debug failures.
- Workflows can call agents. Agents can request approvals. Approvals create inbox items. It all connects.`,
  },
];

const WELCOME_INBOX_ITEMS = [
  {
    type: 'welcome',
    title: 'Welcome to HQ — your workspace is ready',
    body: 'Your demo data is loaded. Open the Demo App, browse your objects, and explore workflows. Check the pinned notes for a full getting-started guide.',
    actionUrl: '/apps/demo',
  },
  {
    type: 'system',
    title: 'Demo App is live with sample data',
    body: 'Customers, products, and orders have been seeded. All of them are real database records — edit, filter, and automate from the Objects page.',
    actionUrl: '/apps/demo',
  },
  {
    type: 'task_assigned',
    title: 'Task: Review the getting-started notes',
    body: 'Three notes have been pinned in your knowledge base. Read them to learn how objects, workflows, and the inbox connect.',
    actionUrl: '/notes',
  },
];

export async function seedBootstrap(db: typeof Db): Promise<void> {
  // Sample notes — keyed by slug for idempotency
  for (const note of WELCOME_NOTES) {
    const existing = await db.note.findFirst({ where: { slug: note.slug } });
    if (!existing) {
      await db.note.create({ data: note });
    }
  }

  // Welcome inbox items — delivered to the first admin user
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
  if (!admin) {
    console.warn('Seed bootstrap: no admin user found, skipping inbox items.');
  } else {
    for (const item of WELCOME_INBOX_ITEMS) {
      const existing = await db.inboxItem.findFirst({
        where: { recipientUserId: admin.id, title: item.title },
      });
      if (!existing) {
        await db.inboxItem.create({
          data: {
            recipientUserId: admin.id,
            type: item.type,
            title: item.title,
            body: item.body,
            actionUrl: item.actionUrl,
            status: 'UNREAD',
          },
        });
      }
    }
  }

  console.log('Seeded bootstrap: welcome notes and inbox items.');
}
