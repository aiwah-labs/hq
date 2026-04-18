/**
 * All job types in the system.
 * Add new job types here — they are automatically type-safe in scheduleJob and registerWorker.
 */
export type JobMap = {
  'messaging.deliver-webhook': {
    deliveryId: string;
    messageId: string;
    recipientBotId: string;
  };
  'messaging.fanout-notifications': {
    messageId: string;
    threadId: string;
    senderType: string;
    senderId: string;
  };
  'messaging.unfurl-links': {
    messageId: string;
    urls: string[];
  };
  'messaging.delivery-retry': {
    deliveryId: string;
  };
  'messaging.agent-trigger': {
    messageId: string;
    threadId: string;
    channelType: string;
    senderId: string;
    senderType: string;
    content: string;
    parentMessageId?: string;
  };
  'agent.run': {
    agentKey: string;
    trigger: {
      type: string;
      channel?: string;
      channelId?: string;
      threadId?: string;
      messageId?: string;
      parentMessageId?: string;
      userId?: string;
      text?: string;
      mode?: string;
      eventType?: string;
      eventPayload?: unknown;
      cronExpression?: string;
      correlationId?: string;
    };
  };
  'workflow.run': {
    workflowKey: string;
    triggerType: string;
    input?: Record<string, unknown>;
    triggerPayload?: Record<string, unknown>;
    correlationId?: string;
  };
  'workflow.resume': {
    runId: string;
    resumeFromNodeId: string;
  };
  'object.import': {
    userId: string;
    objectType: string;
    format: 'csv' | 'json';
    content: string;
    fieldMap?: Record<string, string>;
  };
  'files.sweep-temp': Record<string, never>;
};

export type JobName = keyof JobMap;
export type JobData<T extends JobName> = JobMap[T];
export type WorkerHandler<T extends JobName> = (job: { id: string; name: string; data: JobData<T> }) => Promise<void>;
