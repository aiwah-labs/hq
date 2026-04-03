// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AiwahApiClient } from '@hq/api-client';
import { asText, toMcpError } from '../util.js';

const prospectStageEnum = z.enum([
  'PROSPECT', 'OUTREACH', 'ENGAGED', 'MEETING_BOOKED',
  'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST',
]);

const prospectStatusEnum = z.enum(['ACTIVE', 'PAUSED', 'UNSUBSCRIBED', 'BOUNCED']);

export function registerCrmTools(server: McpServer, client: AiwahApiClient): void {
  // ── Companies ──────────────────────────────────────────────────────────────

  server.tool(
    'crm.company.list',
    'List CRM companies. Filter by country, icpCategory, or search query.',
    {
      country: z.string().optional(),
      icpCategory: z.string().optional(),
      q: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.listCrmCompanies(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.company.get',
    'Get one CRM company by id',
    { companyId: z.string().min(1) },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.getCrmCompany(input.companyId)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.company.create',
    'Create a new CRM company record',
    {
      name: z.string().min(1).max(200),
      website: z.string().max(500).optional(),
      industry: z.string().max(100).optional(),
      country: z.string().max(100).optional(),
      city: z.string().max(100).optional(),
      size: z.string().max(50).optional(),
      icpCategory: z.string().max(100).optional(),
      notes: z.string().max(5000).optional(),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.createCrmCompany(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.company.update',
    'Update a single CRM company record',
    {
      companyId: z.string().min(1),
      name: z.string().min(1).max(200).optional(),
      website: z.string().max(500).nullable().optional(),
      industry: z.string().max(100).nullable().optional(),
      country: z.string().max(100).nullable().optional(),
      city: z.string().max(100).nullable().optional(),
      size: z.string().max(50).nullable().optional(),
      icpCategory: z.string().max(100).nullable().optional(),
      stage: z.string().max(50).optional(),
      notes: z.string().max(5000).nullable().optional(),
    },
    async (input) => {
      try {
        const { companyId, ...data } = input;
        return { content: [{ type: 'text', text: asText(await client.updateCrmCompany(companyId, data as Parameters<typeof client.updateCrmCompany>[1])) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.company.delete',
    'Delete a single CRM company by id. Also removes its contacts.',
    { companyId: z.string().min(1) },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.deleteCrmCompany(input.companyId)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.company.bulk-update',
    'Bulk update up to 500 CRM companies. Each item needs an id plus at least one field.',
    {
      updates: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(200).optional(),
        website: z.string().max(500).nullable().optional(),
        industry: z.string().max(100).nullable().optional(),
        country: z.string().max(100).nullable().optional(),
        city: z.string().max(100).nullable().optional(),
        size: z.string().max(50).nullable().optional(),
        icpCategory: z.string().max(100).nullable().optional(),
        stage: z.string().max(50).optional(),
        notes: z.string().max(5000).nullable().optional(),
        platform: z.string().max(100).nullable().optional(),
        externalId: z.string().max(200).nullable().optional(),
        externalUrl: z.string().max(500).nullable().optional(),
      })).min(1).max(500),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.bulkUpdateCrmCompanies(input.updates)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.company.bulk-delete',
    'Bulk delete up to 500 CRM companies by id. Also removes their contacts.',
    { ids: z.array(z.string().min(1)).min(1).max(500) },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.bulkDeleteCrmCompanies(input.ids)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.company.find-duplicates',
    'Find duplicate CRM companies grouped by shared domain or exact name.',
    {},
    async () => {
      try {
        return { content: [{ type: 'text', text: asText(await client.findCrmDuplicates()) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.company.merge',
    'Merge sourceId into targetId: reassigns contacts, fills null fields, then deletes source. Irreversible.',
    {
      targetId: z.string().min(1).describe('Company to keep'),
      sourceId: z.string().min(1).describe('Company to delete after merging'),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.mergeCrmCompanies(input.targetId, input.sourceId)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // ── Contacts ───────────────────────────────────────────────────────────────

  server.tool(
    'crm.contact.list',
    'List CRM contacts. Filter by company or search query.',
    {
      companyId: z.string().optional(),
      q: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.listCrmContacts(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.contact.create',
    'Create a new CRM contact record',
    {
      firstName: z.string().min(1).max(100),
      lastName: z.string().max(100).optional(),
      email: z.string().email().optional(),
      linkedinUrl: z.string().max(500).optional(),
      title: z.string().max(100).optional(),
      phone: z.string().max(50).optional(),
      companyId: z.string().optional(),
      notes: z.string().max(5000).optional(),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.createCrmContact(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.contact.update',
    'Update a CRM contact record',
    {
      contactId: z.string().min(1),
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().max(100).nullable().optional(),
      email: z.string().email().nullable().optional(),
      linkedinUrl: z.string().max(500).nullable().optional(),
      title: z.string().max(100).nullable().optional(),
      phone: z.string().max(50).nullable().optional(),
      companyId: z.string().nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
    },
    async (input) => {
      try {
        const { contactId, ...data } = input;
        return { content: [{ type: 'text', text: asText(await client.updateCrmContact(contactId, data)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.contact.delete',
    'Delete a single CRM contact by id.',
    { contactId: z.string().min(1) },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.deleteCrmContact(input.contactId)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.contact.bulk-update',
    'Bulk update up to 500 CRM contacts. Each item needs an id plus at least one field.',
    {
      updates: z.array(z.object({
        id: z.string().min(1),
        firstName: z.string().min(1).max(100).optional(),
        lastName: z.string().max(100).nullable().optional(),
        email: z.string().email().nullable().optional(),
        linkedinUrl: z.string().max(500).nullable().optional(),
        title: z.string().max(100).nullable().optional(),
        phone: z.string().max(50).nullable().optional(),
        companyId: z.string().nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      })).min(1).max(500),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.bulkUpdateCrmContacts(input.updates)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // ── Campaigns ──────────────────────────────────────────────────────────────

  server.tool('crm.campaign.list', 'List CRM campaigns with their steps and prospect counts', {}, async () => {
    try {
      return { content: [{ type: 'text', text: asText(await client.listCrmCampaigns()) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool(
    'crm.campaign.get',
    'Get one CRM campaign by id (includes steps and enrolled prospects)',
    { campaignId: z.string().min(1) },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.getCrmCampaign(input.campaignId)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.campaign.create',
    'Create a new CRM campaign (optionally with outreach steps)',
    {
      name: z.string().min(1).max(200),
      vertical: z.string().max(100).optional(),
      description: z.string().max(2000).optional(),
      steps: z.array(z.object({
        stepNumber: z.number().int().min(1),
        delayDays: z.number().int().min(0).default(0),
        subjectLine: z.string().min(1).max(300),
        bodyTemplate: z.string().min(1).max(10000),
      })).optional(),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.createCrmCampaign(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.campaign.update',
    'Update a CRM campaign (name, vertical, description, status)',
    {
      campaignId: z.string().min(1),
      name: z.string().min(1).max(200).optional(),
      vertical: z.string().max(100).optional(),
      description: z.string().max(2000).optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']).optional(),
    },
    async (input) => {
      try {
        const { campaignId, ...data } = input;
        return { content: [{ type: 'text', text: asText(await client.updateCrmCampaign(campaignId, data)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool(
    'crm.campaign.enroll',
    'Enroll one or more contacts into a campaign',
    {
      campaignId: z.string().min(1),
      contactIds: z.array(z.string().min(1)).min(1),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.enrollCrmCampaign(input.campaignId, input.contactIds)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // ── Prospects ──────────────────────────────────────────────────────────────

  server.tool(
    'crm.prospect.list',
    'List CRM prospects. Filter by stage, campaign, or status.',
    {
      stage: prospectStageEnum.optional(),
      campaignId: z.string().optional(),
      status: prospectStatusEnum.optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.listCrmProspects(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool('crm.prospect.due', 'Get prospects due for next action (active with nextStepAt in past)', {}, async () => {
    try {
      return { content: [{ type: 'text', text: asText(await client.listCrmProspectsDue()) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool(
    'crm.prospect.update',
    'Update a prospect (notes, assignment, stage, status, nextStepAt)',
    {
      prospectId: z.string().min(1),
      notes: z.string().max(5000).optional(),
      assignedTo: z.string().nullable().optional(),
      nextStepAt: z.string().datetime().nullable().optional(),
      status: prospectStatusEnum.optional(),
      stage: prospectStageEnum.optional(),
    },
    async (input) => {
      try {
        const { prospectId, stage, ...updateData } = input;
        let result: unknown = await client.updateCrmProspect(prospectId, updateData);
        if (stage) result = await client.updateCrmProspectStage(prospectId, stage);
        return { content: [{ type: 'text', text: asText(result) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // ── Email Accounts ─────────────────────────────────────────────────────────

  server.tool('crm.email-account.list', 'List email accounts configured for outreach', {}, async () => {
    try {
      return { content: [{ type: 'text', text: asText(await client.listCrmEmailAccounts()) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool(
    'crm.email-account.create',
    'Create a new email account for outreach campaigns',
    {
      email: z.string().email(),
      domain: z.string().min(1).max(200),
      provider: z.enum(['GOOGLE', 'ZOHO', 'SMTP']).default('SMTP'),
      dailyLimit: z.number().int().min(1).max(500).default(40),
      warmedUp: z.boolean().default(false),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.createCrmEmailAccount(input)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // ── Bulk Import & Stats ────────────────────────────────────────────────────

  server.tool(
    'crm.bulk-import',
    'Bulk import companies and contacts. Deduplicates on company website/name and contact email. Max 500 items.',
    {
      items: z.array(z.object({
        company: z.object({
          name: z.string().min(1).max(200),
          website: z.string().max(500).optional(),
          industry: z.string().max(100).optional(),
          country: z.string().max(100).optional(),
          city: z.string().max(100).optional(),
          size: z.string().max(50).optional(),
          icpCategory: z.string().max(100).optional(),
          notes: z.string().max(5000).optional(),
        }),
        contacts: z.array(z.object({
          firstName: z.string().min(1).max(100),
          lastName: z.string().max(100).optional(),
          email: z.string().email().optional(),
          linkedinUrl: z.string().max(500).optional(),
          title: z.string().max(100).optional(),
          phone: z.string().max(50).optional(),
          notes: z.string().max(5000).optional(),
        })).optional().default([]),
      })).min(1).max(500),
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: asText(await client.bulkImportCrm(input.items)) }] };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  server.tool('crm.stats', 'Get CRM pipeline stats: totals, breakdown by ICP, stage, and country.', {}, async () => {
    try {
      return { content: [{ type: 'text', text: asText(await client.getCrmStats()) }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });
}
