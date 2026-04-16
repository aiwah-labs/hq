import { db } from './src';

async function main() {
  const campaignId = 'cmmp02bsm0508pm2gt8ppw2lu';
  const calLink = 'https://cal.com/connect-aiwah-labs/30min';
  
  // Step 1
  await db.crmCampaignStep.update({
    where: { campaignId_stepNumber: { campaignId, stepNumber: 1 } },
    data: {
      subjectLine: '{{RANDOM | quick question | your recruiters actually placing people?}}',
      bodyTemplate: 'Hey {{firstName}},\n\nWhen was the last time your ATS actually sped up a placement — rather than just adding more steps?\n\nMost recruiters we talk to spend 15+ hours a week on admin their system was supposed to handle. We build custom automation that fixes this. You own it outright — no monthly platform fees, no per-seat billing.\n\nWorth me sending a quick breakdown of how it works?\n\nAbil'
    }
  });

  // Step 2
  await db.crmCampaignStep.update({
    where: { campaignId_stepNumber: { campaignId, stepNumber: 2 } },
    data: {
      subjectLine: 'Re:',
      bodyTemplate: `Hey {{firstName}},\n\nQuick maths: if your recruiters lose 15 hrs a week to admin, at a $75/hr billing rate — that's $58k per recruiter per year in unbilled capacity.\n\nWe build systems that automate the admin layer for staffing agencies. Custom-built, you own it, no SaaS subscriptions.\n\nDoes that number sound familiar? Worth a quick chat? ${calLink}\n\nAbil`
    }
  });
  
  console.log('✅ Steps updated');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
