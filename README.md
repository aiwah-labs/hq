# HQ

**The operating system where your agents and employees collaborate.**

HQ is a template for building self-hosted infrastructure that accelerates your organisation. Clone it, load it into a coding agent, and shape it to your business. Your data stays in your database. Your logic lives in your codebase.

```bash
git clone https://github.com/aiwah-labs/hq
```

---

## Getting started

Clone the repo and point a coding agent at it — Claude Code, Cursor, Codex, or any agent that can read and write code. Tell it what your business does and what you need. The platform is designed to be extended through conversation.

```bash
git clone https://github.com/aiwah-labs/hq
cd hq
pnpm install
cp .env.example .env
pnpm db:local:bootstrap
pnpm dev:platform
```

---

## The platform

HQ gives you the building blocks to define the data structures, logic, and interfaces your business needs — then connects your team and your agents to operate through them together.

**Objects** are the entities your business runs on — contacts, deals, bookings, projects, or anything else your domain requires. Define the model, and the rest of the platform picks it up automatically.

**Actions** are the operations that can be executed on those entities. Whether triggered by a human in the UI, an agent mid-conversation, or a step in a workflow, every action flows through the same layer with the same permissions.

**Agents** are AI that work inside your system — with access to your data, your actions, and your team's context. They can respond to messages, react to events, run on a schedule, or participate as a node in a workflow.

**Workflows** are deterministic chains of actions. Define them in code, trigger them from events or schedules, and let them handle the repetitive operational work your team shouldn't have to think about.

**Notes** are the shared knowledge base for your team and your agents. Agents can search and reference them, so your internal context is always available without re-explaining it.

**Workshop** is the central UI your team works from. It surfaces everything — records, threads, workflow runs, agent activity — in one place. You can add more apps alongside it for different audiences.

**MCP** connects your HQ instance to any external agent or LLM. Every object and action in your platform becomes a tool that Claude Desktop, Cursor, or any coding agent can use directly.

**Permissions** let you decide who has access to your business data and logic. Your team members get access to what their role requires. AI agents know what they can do autonomously and what needs a human to approve first.

---

MIT License · Built by [Aiwah Labs](https://aiwahlabs.com)

Questions? [abil@aiwahlabs.com](mailto:abil@aiwahlabs.com) · [aiwahlabs.com](https://aiwahlabs.com)
