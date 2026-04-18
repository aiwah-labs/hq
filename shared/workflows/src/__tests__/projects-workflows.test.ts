import { describe, it, expect } from 'vitest';
import { getWorkflow } from '../registry.js';
// Side-effect: register workflows
import '../workflows/index.js';

describe('projects workflows', () => {
  it('registers the weekly status digest', () => {
    const wf = getWorkflow('projects.weekly-status-digest');
    expect(wf).toBeDefined();
    expect(wf!.name).toContain('status');
    // Has a manual trigger and a cron trigger.
    expect(wf!.triggers.some((t) => t.type === 'manual')).toBe(true);
    expect(wf!.triggers.some((t) => t.type === 'cron')).toBe(true);
    // Entry node + summarise node present
    const ids = wf!.nodes.map((n) => n.id);
    expect(ids).toContain('list-projects');
    expect(ids).toContain('summarise-each');
    expect(ids).toContain('compile-digest');
  });

  it('registers the stale review workflow', () => {
    const wf = getWorkflow('projects.stale-review');
    expect(wf).toBeDefined();
    const ids = wf!.nodes.map((n) => n.id);
    expect(ids).toContain('load-projects');
    expect(ids).toContain('find-stale');
  });

  it('digest entry node is list-projects', () => {
    const wf = getWorkflow('projects.weekly-status-digest')!;
    expect(wf.entryNodeId).toBe('list-projects');
  });

  it('stale review entry node is load-projects', () => {
    const wf = getWorkflow('projects.stale-review')!;
    expect(wf.entryNodeId).toBe('load-projects');
  });

  it('digest edges go list → summarise → compile', () => {
    const wf = getWorkflow('projects.weekly-status-digest')!;
    const pairs = wf.edges.map((e) => `${e.from}->${e.to}`);
    expect(pairs).toContain('list-projects->summarise-each');
    expect(pairs).toContain('summarise-each->compile-digest');
  });
});
