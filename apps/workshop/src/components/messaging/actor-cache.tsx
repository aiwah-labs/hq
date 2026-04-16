'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getApiBaseUrl, getInternalSecret } from '@/lib/api-url';

export type ActorInfo = { name: string; email?: string; type: 'USER' | 'BOT' | 'AGENT' };

interface ActorCacheContextValue {
  getActor: (type: string, id: string) => ActorInfo | undefined;
  getActorName: (type: string, id: string) => string;
  selfId: string | null;
}

const ActorCacheContext = createContext<ActorCacheContextValue>({
  getActor: () => undefined,
  getActorName: () => 'Unknown',
  selfId: null,
});

export function useActorCache() {
  return useContext(ActorCacheContext);
}

export function ActorCacheProvider({ selfId, children }: { selfId: string | null; children: ReactNode }) {
  const [cache, setCache] = useState<Map<string, ActorInfo>>(new Map());
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    const headers = { 'x-internal-shared-secret': getInternalSecret() };

    Promise.all([
      fetch(`${apiBase}/v1/users?limit=200`, { credentials: 'include', headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${apiBase}/v1/bots?limit=200`, { credentials: 'include', headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${apiBase}/v1/agents`, { credentials: 'include', headers }).then((r) => r.ok ? r.json() : []),
    ]).then(([usersRaw, botsRaw, agentsRaw]) => {
      const map = new Map<string, ActorInfo>();
      const users = Array.isArray(usersRaw) ? usersRaw : [];
      const bots = Array.isArray(botsRaw) ? botsRaw : botsRaw.items ?? [];
      const agents = Array.isArray(agentsRaw) ? agentsRaw : [];
      for (const u of users) {
        map.set(`USER:${u.id}`, { name: u.name ?? u.email ?? `User ${u.id.slice(0, 6)}`, email: u.email, type: 'USER' });
      }
      for (const b of bots) {
        map.set(`BOT:${b.id}`, { name: b.name ?? `Bot ${b.id.slice(0, 6)}`, type: 'BOT' });
      }
      for (const a of agents) {
        // Agents use their key as id (e.g. "workshop-assistant")
        map.set(`AGENT:${a.key}`, { name: a.name ?? a.key, type: 'AGENT' });
      }
      setCache(map);
    }).catch(() => {});
  }, [apiBase]);

  const getActor = useCallback((type: string, id: string) => cache.get(`${type}:${id}`), [cache]);
  const getActorName = useCallback((type: string, id: string) => {
    const actor = cache.get(`${type}:${id}`);
    if (actor) return actor.name;
    if (type === 'AGENT') return id; // agentKey is already human-readable
    return type === 'BOT' ? `Bot ${id.slice(0, 6)}` : `User ${id.slice(0, 6)}`;
  }, [cache]);

  return (
    <ActorCacheContext.Provider value={{ getActor, getActorName, selfId }}>
      {children}
    </ActorCacheContext.Provider>
  );
}
