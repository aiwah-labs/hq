import { registerWorker } from '@hq/jobs';
import { db } from '@hq/db';
import { notifyMessaging } from '../lib/notify.js';

export async function registerMessagingWorkers(): Promise<void> {
  // Worker: deliver an outbound message event to a bot webhook
  await registerWorker('messaging.deliver-webhook', async (job) => {
    const { messageId, recipientBotId } = job.data as {
      messageId: string;
      recipientBotId: string;
    };

    const [message, bot] = await Promise.all([
      db.msgMessage.findUnique({ where: { id: messageId }, include: { thread: true } }),
      db.bot.findUnique({ where: { id: recipientBotId } }),
    ]);

    if (!message || !bot) return;

    // Notify connected SSE clients that a message was delivered to a bot
    await notifyMessaging({
      type: 'message.created',
      threadId: message.threadId,
      message: {
        id: message.id,
        senderType: message.senderType,
        senderId: message.senderId,
        content: message.content,
        createdAt: message.createdAt,
      },
    });
  });
}
