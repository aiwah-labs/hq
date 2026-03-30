import { getBoss } from '@hq/jobs';
import { db } from '@hq/db';
import { getAgents } from '../registry.js';

export async function syncAgentCrons(): Promise<void> {
  const boss = await getBoss();
  const agents = getAgents();

  for (const def of agents) {
    const cronTriggers = def.defaultTriggers.filter(
      (t) => t.type === 'cron' && t.cronExpression
    );

    if (cronTriggers.length === 0) continue;

    // Check if agent is enabled
    const config = await db.agentConfig.findUnique({ where: { agentKey: def.key } });
    if (config?.enabled === false) continue;

    for (const trigger of cronTriggers) {
      const jobName = `agent.cron.${def.key}`;
      try {
        await boss.schedule(jobName, trigger.cronExpression!, {
          agentKey: def.key,
          trigger: { type: 'cron', cronExpression: trigger.cronExpression },
        });
      } catch {
        // Ignore if schedule already exists — pg-boss will upsert
      }
    }
  }
}
