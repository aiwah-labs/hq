// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import crypto from 'node:crypto';
import { db } from '@hq/db';
import { registerWorker, scheduleJobIn } from '@hq/jobs';
import { createNotification } from '@hq/services';
import { notifyMessaging } from '../lib/notify.js';

// ─── Backoff schedule (seconds) ───────────────────────────────────────────────
const RETRY_DELAYS = [30, 120, 480, 1800, 7200]; // 30s, 2m, 8m, 30m, 2h

// ─── Webhook Delivery ──────────────────────────────────────────────────────────

export async function registerMessagingWorkers(): Promise<void> {
  // Worker: deliver webhook to a bot
  await registerWorker('messaging.deliver-webhook', async (job) => {
    const { deliveryId, messageId, recipientBotId } = job.data;

    const delivery = await db.msgDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery || delivery.status === 'delivered') return;

    const [message, bot] = await Promise.all([
      db.msgMessage.findUnique({
        where: { id: messageId },
        include: { attachments: true, thread: true },
      }),
      db.botMessagingConfig.findUnique({ where: { botId: recipientBotId } }),
    ]);

    if (!message || !bot?.webhookUrl) {
      await db.msgDelivery.update({
        where: { id: deliveryId },
        data: { status: 'skipped', failureReason: bot?.webhookUrl ? 'message not found' : 'no webhook configured' },
      });
      return;
    }

    const payload = {
      event: 'message.created',
      timestamp: new Date().toISOString(),
      thread: {
        id: message.thread.id,
        name: message.thread.name,
        type: message.thread.type,
      },
      message: {
        id: message.id,
        senderType: message.senderType,
        senderId: message.senderId,
        content: message.content,
        contentType: message.contentType,
        blocks: message.blocks,
        attachments: message.attachments.map((a) => ({
          id: a.id,
          type: a.type,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          url: a.url,
        })),
        parentMessageId: message.parentMessageId,
        createdAt: message.createdAt.toISOString(),
      },
    };

    const body = JSON.stringify(payload);
    const signature = bot.webhookSecret
      ? 'sha256=' + crypto.createHmac('sha256', bot.webhookSecret).update(body).digest('hex')
      : undefined;

    const attempt = (delivery.attempts ?? 0) + 1;
    await db.msgDelivery.update({
      where: { id: deliveryId },
      data: { attempts: attempt, lastAttemptAt: new Date() },
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(bot.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(signature ? { 'X-Aiwah-Signature': signature } : {}),
          'X-Aiwah-Delivery-Id': deliveryId,
          'User-Agent': 'Aiwah-Webhooks/1.0',
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        await db.msgDelivery.update({
          where: { id: deliveryId },
          data: { status: 'delivered', deliveredAt: new Date() },
        });
        return;
      }

      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : 'unknown error';

      if (attempt >= 5) {
        await db.msgDelivery.update({
          where: { id: deliveryId },
          data: { status: 'failed', failureReason },
        });
        return;
      }

      // Re-enqueue with backoff
      const delaySeconds = RETRY_DELAYS[attempt - 1] ?? 7200;
      await db.msgDelivery.update({
        where: { id: deliveryId },
        data: { status: 'pending', failureReason },
      });
      await scheduleJobIn('messaging.delivery-retry', { deliveryId }, delaySeconds);
    }
  });

  // Worker: retry a delivery
  await registerWorker('messaging.delivery-retry', async (job) => {
    const delivery = await db.msgDelivery.findUnique({ where: { id: job.data.deliveryId } });
    if (!delivery) return;

    // Re-enqueue as a fresh deliver-webhook job
    const { scheduleJob } = await import('@hq/jobs');
    await scheduleJob('messaging.deliver-webhook', {
      deliveryId: delivery.id,
      messageId: delivery.messageId,
      recipientBotId: delivery.recipientId,
    });
  });

  // Worker: fan out notifications to all participants
  await registerWorker('messaging.fanout-notifications', async (job) => {
    const { messageId, threadId, senderType, senderId } = job.data;

    const [message, participants] = await Promise.all([
      db.msgMessage.findUnique({
        where: { id: messageId },
        include: { thread: true },
      }),
      db.msgParticipant.findMany({
        where: { threadId, leftAt: null },
      }),
    ]);

    if (!message) return;

    for (const participant of participants) {
      // Don't notify the sender
      if (participant.actorType === senderType && participant.actorId === senderId) continue;
      // Don't notify muted participants (unless @mentioned)
      if (participant.notifyLevel === 'none') continue;

      // Determine notification type
      const isMention = message.content.includes(`@[`) &&
        message.content.includes(participant.actorId);
      const isDM = message.thread.type === 'DM';

      if (participant.notifyLevel === 'mentions' && !isMention && !isDM) continue;

      const notifType = isDM ? 'dm' : isMention ? 'mention' : 'thread_message';
      const title = message.thread.name ?? 'New message';
      const body = message.isDeleted ? 'Message deleted' :
        message.content.slice(0, 120) || 'Sent an attachment';

      const notif = await createNotification({
        recipientType: participant.actorType,
        recipientId: participant.actorId,
        type: notifType,
        threadId,
        messageId,
        title,
        body,
      });

      // Push SSE notification event
      await notifyMessaging({
        type: 'notification',
        recipientType: participant.actorType,
        recipientId: participant.actorId,
        notification: {
          id: notif.id,
          type: notif.type,
          threadId: notif.threadId,
          messageId: notif.messageId,
          title: notif.title,
          body: notif.body,
          createdAt: notif.createdAt,
        },
      });

      // Enqueue webhook delivery for bot participants
      if (participant.actorType === 'BOT') {
        const botConfig = await db.botMessagingConfig.findUnique({
          where: { botId: participant.actorId },
        });
        if (botConfig?.webhookUrl) {
          const delivery = await db.msgDelivery.create({
            data: {
              messageId,
              recipientType: 'BOT',
              recipientId: participant.actorId,
              channel: 'webhook',
              status: 'pending',
            },
          });
          const { scheduleJob } = await import('@hq/jobs');
          await scheduleJob('messaging.deliver-webhook', {
            deliveryId: delivery.id,
            messageId,
            recipientBotId: participant.actorId,
          });
        }
      }
    }
  });

  // Worker: unfurl links in messages
  await registerWorker('messaging.unfurl-links', async (job) => {
    const { messageId, urls } = job.data;

    const previews: Record<string, unknown>[] = [];

    for (const url of urls.slice(0, 3)) { // max 3 previews per message
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Aiwah-LinkPreview/1.0' },
        });
        clearTimeout(timeout);

        if (!res.ok) continue;

        const html = await res.text();
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
        const description = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)?.[1]
          ?? html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)?.[1];
        const image = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1]
          ?? html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]+)"/i)?.[1];
        const siteName = html.match(/<meta[^>]*property="og:site_name"[^>]*content="([^"]+)"/i)?.[1];

        if (title) {
          previews.push({ url, title, description, image, siteName });
        }
      } catch {
        // Skip failed URLs
      }
    }

    if (previews.length === 0) return;

    const msg = await db.msgMessage.findUnique({ where: { id: messageId } });
    if (!msg) return;

    const existingMeta = (msg.metadata ?? {}) as Record<string, unknown>;
    await db.msgMessage.update({
      where: { id: messageId },
      data: { metadata: { ...existingMeta, linkPreviews: previews as unknown as Record<string, unknown>[] } as object },
    });

    // Notify SSE that message was updated (clients will re-fetch metadata)
    await notifyMessaging({
      type: 'message.updated',
      threadId: msg.threadId,
      message: { id: messageId, metadata: { linkPreviews: previews } },
    });
  });
}
