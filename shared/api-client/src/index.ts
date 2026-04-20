interface ApiClientOptions {
  baseUrl: string;
  cookieHeader?: string;
  internalSecret?: string;
}

type NoteInput = { title: string; body?: string; tags?: string[]; isPinned?: boolean };
type NoteUpdate = { title?: string; body?: string; tags?: string[]; slug?: string | null; isPinned?: boolean };

type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'BLOCKED' | 'DONE' | 'CANCELLED';
type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

type ProjectInput = {
  name: string;
  summary?: string;
  status?: 'PLANNED' | 'ACTIVE' | 'BLOCKED';
  priority?: Priority;
  targetInDays?: number;
  startDate?: string;
  targetDate?: string;
};
type ProjectUpdate = {
  name?: string;
  summary?: string | null;
  status?: ProjectStatus;
  priority?: Priority;
  startDate?: string | null;
  targetDate?: string | null;
  ownerUserId?: string | null;
};

type TaskInput = {
  projectId: string;
  title: string;
  description?: string;
  priority?: Priority;
  assigneeUserId?: string;
  dueAt?: string;
  dueInDays?: number;
};
type TaskUpdate = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  assigneeUserId?: string | null;
  dueAt?: string | null;
  blockedReason?: string | null;
};

function buildClient(opts: ApiClientOptions) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.cookieHeader) headers['cookie'] = opts.cookieHeader;
    if (opts.internalSecret) headers['x-internal-shared-secret'] = opts.internalSecret;

    const res = await fetch(`${opts.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> ?? {}) },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  return {
    // Generic HTTP methods — use for any endpoint not covered by named methods below
    get<T>(path: string) {
      return request<T>(path);
    },
    post<T>(path: string, body?: unknown) {
      return request<T>(path, {
        method: 'POST',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    },
    patch<T>(path: string, body: unknown) {
      return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
    },
    delete<T = void>(path: string) {
      return request<T>(path, { method: 'DELETE' });
    },

    // Notes
    listNotes(params?: { q?: string; tag?: string; isPinned?: boolean; limit?: number }) {
      const qs = new URLSearchParams();
      if (params?.q) qs.set('q', params.q);
      if (params?.tag) qs.set('tag', params.tag);
      if (params?.isPinned !== undefined) qs.set('isPinned', String(params.isPinned));
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      const query = qs.toString();
      return request<unknown[]>(`/v1/notes${query ? `?${query}` : ''}`);
    },
    getNote(noteId: string) {
      return request<unknown>(`/v1/notes/${noteId}`);
    },
    createNote(data: NoteInput) {
      return request<unknown>('/v1/notes', { method: 'POST', body: JSON.stringify(data) });
    },
    updateNote(noteId: string, data: NoteUpdate) {
      return request<unknown>(`/v1/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    deleteNote(noteId: string) {
      return request<void>(`/v1/notes/${noteId}`, { method: 'DELETE' });
    },

    // Projects
    listProjects(params?: { q?: string; status?: ProjectStatus; priority?: Priority; ownerUserId?: string; limit?: number; cursor?: string }) {
      const qs = new URLSearchParams();
      if (params?.q) qs.set('q', params.q);
      if (params?.status) qs.set('status', params.status);
      if (params?.priority) qs.set('priority', params.priority);
      if (params?.ownerUserId) qs.set('ownerUserId', params.ownerUserId);
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      const query = qs.toString();
      return request<{ items: unknown[]; total: number }>(`/v1/projects${query ? `?${query}` : ''}`);
    },
    countProjects(params?: { q?: string; status?: ProjectStatus; priority?: Priority }) {
      const qs = new URLSearchParams();
      if (params?.q) qs.set('q', params.q);
      if (params?.status) qs.set('status', params.status);
      if (params?.priority) qs.set('priority', params.priority);
      const query = qs.toString();
      return request<{ count: number }>(`/v1/projects/count${query ? `?${query}` : ''}`);
    },
    getProject(projectId: string) {
      return request<unknown>(`/v1/projects/${projectId}`);
    },
    createProject(data: ProjectInput) {
      return request<unknown>('/v1/projects', { method: 'POST', body: JSON.stringify(data) });
    },
    updateProject(projectId: string, data: ProjectUpdate) {
      return request<unknown>(`/v1/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    deleteProject(projectId: string) {
      return request<void>(`/v1/projects/${projectId}`, { method: 'DELETE' });
    },
    getProjectStats(projectId: string) {
      return request<unknown>(`/v1/projects/${projectId}/stats`);
    },

    // Tasks
    listTasks(params?: { q?: string; projectId?: string; status?: TaskStatus; priority?: Priority; assigneeUserId?: string; overdue?: boolean; limit?: number; cursor?: string }) {
      const qs = new URLSearchParams();
      if (params?.q) qs.set('q', params.q);
      if (params?.projectId) qs.set('projectId', params.projectId);
      if (params?.status) qs.set('status', params.status);
      if (params?.priority) qs.set('priority', params.priority);
      if (params?.assigneeUserId) qs.set('assigneeUserId', params.assigneeUserId);
      if (params?.overdue !== undefined) qs.set('overdue', String(params.overdue));
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      const query = qs.toString();
      return request<{ items: unknown[]; total: number }>(`/v1/tasks${query ? `?${query}` : ''}`);
    },
    countTasks(params?: { projectId?: string; status?: TaskStatus; assigneeUserId?: string; overdue?: boolean }) {
      const qs = new URLSearchParams();
      if (params?.projectId) qs.set('projectId', params.projectId);
      if (params?.status) qs.set('status', params.status);
      if (params?.assigneeUserId) qs.set('assigneeUserId', params.assigneeUserId);
      if (params?.overdue !== undefined) qs.set('overdue', String(params.overdue));
      const query = qs.toString();
      return request<{ count: number }>(`/v1/tasks/count${query ? `?${query}` : ''}`);
    },
    getTask(taskId: string) {
      return request<unknown>(`/v1/tasks/${taskId}`);
    },
    createTask(data: TaskInput) {
      return request<unknown>('/v1/tasks', { method: 'POST', body: JSON.stringify(data) });
    },
    updateTask(taskId: string, data: TaskUpdate) {
      return request<unknown>(`/v1/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    deleteTask(taskId: string) {
      return request<void>(`/v1/tasks/${taskId}`, { method: 'DELETE' });
    },
    completeTask(taskId: string) {
      return request<unknown>(`/v1/tasks/${taskId}/complete`, { method: 'POST' });
    },
    assignTask(taskId: string, assigneeUserId: string | null) {
      return request<unknown>(`/v1/tasks/${taskId}/assign`, { method: 'POST', body: JSON.stringify({ assigneeUserId }) });
    },
    blockTask(taskId: string, reason: string) {
      return request<unknown>(`/v1/tasks/${taskId}/block`, { method: 'POST', body: JSON.stringify({ reason }) });
    },
    listBlockedTasks(params?: { projectId?: string; limit?: number }) {
      const qs = new URLSearchParams();
      if (params?.projectId) qs.set('projectId', params.projectId);
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      const query = qs.toString();
      return request<unknown[]>(`/v1/tasks/blocked${query ? `?${query}` : ''}`);
    },
    listOverdueTasks(params?: { projectId?: string; assigneeUserId?: string; limit?: number }) {
      const qs = new URLSearchParams();
      if (params?.projectId) qs.set('projectId', params.projectId);
      if (params?.assigneeUserId) qs.set('assigneeUserId', params.assigneeUserId);
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      const query = qs.toString();
      return request<unknown[]>(`/v1/tasks/overdue${query ? `?${query}` : ''}`);
    },

    // Bots
    listBots() {
      return request<unknown[]>('/v1/bots');
    },
    getBot(botId: string) {
      return request<unknown>(`/v1/bots/${botId}`);
    },
    listBotKeys(botId: string) {
      return request<unknown[]>(`/v1/bots/${botId}/keys`);
    },
  };
}

export function createApiClient(opts: ApiClientOptions) {
  return buildClient(opts);
}
