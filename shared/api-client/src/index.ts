export class HQApiClient {
  constructor(
    private baseUrl: string,
    private token?: string
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async listCustomers() {
    return this.request<unknown[]>('/v1/objects/customer');
  }
  async listProducts() {
    return this.request<unknown[]>('/v1/objects/product');
  }
  async listNotes() {
    return this.request<unknown[]>('/v1/notes');
  }
  async listThreads() {
    return this.request<unknown[]>('/v1/messaging/threads');
  }
  async listAgents() {
    return this.request<unknown[]>('/v1/agents');
  }
  async listWorkflows() {
    return this.request<unknown[]>('/v1/workflows');
  }
}
