import { describe, it, expect } from 'vitest';
import { objects } from '../registry.js';
import { moduleObjects } from '../modules/index.js';
import { crmObjects } from '../modules/crm.js';
import { projectsTasksObjects } from '../modules/projects-tasks.js';

describe('module convention', () => {
  it('crm module exports Customer + Product', () => {
    expect(Object.keys(crmObjects).sort()).toEqual(['Customer', 'Product']);
  });

  it('projects-tasks module exports Project + Task', () => {
    expect(Object.keys(projectsTasksObjects).sort()).toEqual(['Project', 'Task']);
  });

  it('moduleObjects folds every module into one map', () => {
    for (const [key, def] of Object.entries(crmObjects)) {
      expect(moduleObjects[key]).toBe(def);
    }
    for (const [key, def] of Object.entries(projectsTasksObjects)) {
      expect(moduleObjects[key]).toBe(def);
    }
  });

  it('root registry exposes module objects without duplication', () => {
    for (const key of Object.keys(moduleObjects)) {
      expect(objects[key]).toBeDefined();
    }
  });

  it('module objects include default permissions derived from their model', () => {
    const customer = moduleObjects.Customer;
    expect(customer).toBeDefined();
    expect(customer!.scopes.read).toBe('customer.read');
  });

  it('Project declares ownerField for ownership-aware access', () => {
    const project = moduleObjects.Project;
    expect(project).toBeDefined();
    expect(project!.ownership?.ownerField).toBe('ownerUserId');
  });

  it('Task declares assigneeField for ownership-aware access', () => {
    const task = moduleObjects.Task;
    expect(task).toBeDefined();
    expect(task!.ownership?.assigneeField).toBe('assigneeUserId');
  });
});
