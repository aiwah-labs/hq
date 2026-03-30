export interface PlatformEventRecord {
  id: string;
  type: string;
  actorType: string;
  actorId: string;
  objectType: string | null;
  objectId: string | null;
  payload: unknown;
  correlationId: string | null;
  createdAt: Date;
}

export interface PlatformEventNotification {
  id: string;
  type: string;
  objectType: string | null;
  objectId: string | null;
}
