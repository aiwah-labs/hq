import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createServiceContext } from '@hq/services';
import { db } from '@hq/db';
import { ApiError } from '../../lib/errors';
import { requireAuth } from '../../lib/auth';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBody<T>(input: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid request payload.', parsed.error.flatten());
  }
  return parsed.data;
}

function parseQuery<T>(input: unknown, schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'BAD_REQUEST', 'Invalid query parameters.', parsed.error.flatten());
  }
  return parsed.data;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const companyBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(500).optional(),
  industry: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  size: z.string().trim().max(50).optional(),
  icpCategory: z.string().trim().max(100).optional(),
  notes: z.string().max(5000).optional(),
  platform: z.string().trim().max(100).optional(),
  externalId: z.string().trim().max(200).optional(),
  externalUrl: z.string().trim().max(500).optional(),
});

const contactBodySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional(),
  linkedinUrl: z.string().trim().max(500).optional(),
  title: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
  companyId: z.string().optional(),
  notes: z.string().max(5000).optional(),
});

const campaignStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  delayDays: z.number().int().min(0).default(0),
  subjectLine: z.string().trim().min(1).max(300),
  bodyTemplate: z.string().min(1).max(10000),
});

const campaignBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  vertical: z.string().trim().max(100).optional(),
  description: z.string().max(2000).optional(),
  platform: z.string().trim().max(100).optional(),
  externalId: z.string().trim().max(200).optional(),
  externalUrl: z.string().trim().max(500).optional(),
  steps: z.array(campaignStepSchema).optional(),
});

const enrollBodySchema = z.object({
  contactIds: z.array(z.string()).min(1),
});

const campaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']);
const prospectStageSchema = z.enum([
  'PROSPECT', 'OUTREACH', 'ENGAGED', 'MEETING_BOOKED', 'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST',
]);
const prospectStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'UNSUBSCRIBED', 'BOUNCED']);

const prospectUpdateSchema = z.object({
  notes: z.string().max(5000).optional(),
  assignedTo: z.string().optional().nullable(),
  nextStepAt: z.string().datetime().optional().nullable(),
  status: prospectStatusSchema.optional(),
});

const outreachEmailBodySchema = z.object({
  prospectId: z.string().min(1),
  fromEmail: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1),
  stepNumber: z.number().int().optional(),
  sentAt: z.string().datetime().optional(),
});

const emailAccountBodySchema = z.object({
  email: z.string().email(),
  domain: z.string().min(1).max(200),
  provider: z.enum(['GOOGLE', 'ZOHO', 'SMTP']).default('SMTP'),
  dailyLimit: z.number().int().min(1).max(500).default(40),
  warmedUp: z.boolean().default(false),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerCrmRoutes(app: FastifyInstance) {

  // ── Companies ───────────────────────────────────────────────────────────────

  // ── CRM Stats ───────────────────────────────────────────────────────────────

  app.get('/v1/crm/stats', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    const [companies, contacts, byStage, byIcp, byCountry, distinctCountries, distinctIcps] = await Promise.all([
      db.crmCompany.count(),
      db.crmContact.count(),
      db.crmCompany.groupBy({ by: ['stage'], _count: true }),
      db.crmCompany.groupBy({ by: ['icpCategory'], _count: true, orderBy: { _count: { icpCategory: 'desc' } } }),
      db.crmCompany.groupBy({
        by: ['country'],
        _count: { _all: true },
        orderBy: { _count: { country: 'desc' } },
      }),
      db.crmCompany.findMany({ select: { country: true }, distinct: ['country'], orderBy: { country: 'asc' } }),
      db.crmCompany.findMany({ select: { icpCategory: true }, distinct: ['icpCategory'], orderBy: { icpCategory: 'asc' } }),
    ]);

    // Count contacts per country via companies
    const contactsByCountry = await db.$queryRaw<Array<{ country: string | null; count: bigint }>>`
      SELECT co."country", COUNT(ct.id) as count
      FROM "CrmCompany" co
      LEFT JOIN "CrmContact" ct ON ct."companyId" = co.id
      GROUP BY co."country"
      ORDER BY count DESC
    `;
    const contactCountryMap = Object.fromEntries(
      contactsByCountry.map((r) => [r.country ?? 'Unknown', Number(r.count)])
    );

    return {
      companies,
      contacts,
      byStage: Object.fromEntries(byStage.map((s) => [s.stage, s._count])),
      byIcp: byIcp.map((s) => ({ icpCategory: s.icpCategory, count: s._count })),
      byCountry: byCountry.map((s) => ({
        country: s.country ?? 'Unknown',
        companies: s._count._all,
        contacts: contactCountryMap[s.country ?? 'Unknown'] ?? 0,
      })),
      filters: {
        countries: distinctCountries.map((c) => c.country).filter(Boolean) as string[],
        icpCategories: distinctIcps.map((c) => c.icpCategory).filter(Boolean) as string[],
      },
    };
  });

  app.get('/v1/crm/companies', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    const query = parseQuery(request.query, z.object({
      country: z.string().optional(),
      icpCategory: z.string().optional(),
      stage: z.string().optional(),
      platform: z.string().optional(),
      externalId: z.string().optional(),
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      cursor: z.string().optional(),
    }));

    const items = await db.crmCompany.findMany({
      where: {
        ...(query.country && { country: query.country }),
        ...(query.icpCategory && { icpCategory: query.icpCategory }),
        ...(query.stage && { stage: query.stage as any }),
        ...(query.platform && { platform: query.platform }),
        ...(query.externalId && { externalId: query.externalId }),
        ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
        ...(query.cursor && { id: { lt: query.cursor } }),
      },
      include: { _count: { select: { contacts: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return items;
  });

  app.post('/v1/crm/companies', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const body = parseBody(request.body, companyBodySchema);
    return db.crmCompany.create({ data: body });
  });

  // ── Bulk Update Companies ───────────────────────────────────────────────────
  // PATCH /v1/crm/companies/bulk — update up to 500 companies in one call.
  // Each item requires an id plus at least one field to change.
  // Used for: ICP cleanup, country normalisation, website backfill, etc.

  app.patch('/v1/crm/companies/bulk', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const body = parseBody(request.body, z.object({
      updates: z.array(z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(200).optional(),
        website: z.string().trim().max(500).nullable().optional(),
        industry: z.string().trim().max(100).nullable().optional(),
        country: z.string().trim().max(100).nullable().optional(),
        city: z.string().trim().max(100).nullable().optional(),
        size: z.string().trim().max(50).nullable().optional(),
        icpCategory: z.string().trim().max(100).nullable().optional(),
        stage: z.string().trim().max(50).optional(),
        notes: z.string().max(5000).nullable().optional(),
        platform: z.string().trim().max(100).nullable().optional(),
        externalId: z.string().trim().max(200).nullable().optional(),
        externalUrl: z.string().trim().max(500).nullable().optional(),
      })).min(1).max(500),
    }));

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const { id, stage, ...rest } of body.updates) {
      try {
        await db.crmCompany.update({
          where: { id },
          data: {
            ...rest,
            ...(stage !== undefined && { stage: stage as any }),
          },
        });
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return {
      summary: {
        total: results.length,
        updated: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
      },
      results,
    };
  });

  // ── Bulk Update Contacts ────────────────────────────────────────────────────
  // PATCH /v1/crm/contacts/bulk — update up to 500 contacts in one call.

  app.patch('/v1/crm/contacts/bulk', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const body = parseBody(request.body, z.object({
      updates: z.array(z.object({
        id: z.string().min(1),
        firstName: z.string().trim().min(1).max(100).optional(),
        lastName: z.string().trim().max(100).nullable().optional(),
        email: z.string().trim().email().nullable().optional(),
        linkedinUrl: z.string().trim().max(500).nullable().optional(),
        title: z.string().trim().max(100).nullable().optional(),
        phone: z.string().trim().max(50).nullable().optional(),
        companyId: z.string().nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      })).min(1).max(500),
    }));

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const { id, ...data } of body.updates) {
      try {
        await db.crmContact.update({ where: { id }, data });
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return {
      summary: {
        total: results.length,
        updated: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
      },
      results,
    };
  });

  // ── Bulk Delete Companies ───────────────────────────────────────────────────
  // DELETE /v1/crm/companies/bulk — delete up to 500 companies by id.
  // Also deletes their contacts (cascaded via Prisma schema).

  app.delete('/v1/crm/companies/bulk', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const body = parseBody(request.body, z.object({
      ids: z.array(z.string().min(1)).min(1).max(500),
    }));

    const deleted = await db.crmCompany.deleteMany({
      where: { id: { in: body.ids } },
    });

    return { deleted: deleted.count };
  });

  // ── Find Duplicate Companies ────────────────────────────────────────────────
  // GET /v1/crm/companies/duplicates — returns groups of companies that share
  // the same normalised domain (website) or exact name (case-insensitive).
  // Used as input for the merge workflow.

  app.get('/v1/crm/companies/duplicates', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });

    function extractDomain(website: string): string {
      try {
        return new URL(website.startsWith('http') ? website : `https://${website}`)
          .hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return website.toLowerCase().replace(/^www\./, '');
      }
    }

    // Fetch all companies (need full list to build groups)
    const all = await db.crmCompany.findMany({
      include: { _count: { select: { contacts: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Group by domain
    const byDomain = new Map<string, typeof all>();
    for (const co of all) {
      if (!co.website) continue;
      const d = extractDomain(co.website);
      if (!byDomain.has(d)) byDomain.set(d, []);
      byDomain.get(d)!.push(co);
    }

    // Group by name (case-insensitive) — only for companies without website
    const noWebsite = all.filter(co => !co.website);
    const byName = new Map<string, typeof all>();
    for (const co of noWebsite) {
      const key = co.name.toLowerCase().trim();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(co);
    }

    const groups: Array<{ type: 'domain' | 'name'; key: string; companies: typeof all }> = [];

    for (const [domain, companies] of byDomain) {
      if (companies.length > 1) groups.push({ type: 'domain', key: domain, companies });
    }
    for (const [name, companies] of byName) {
      if (companies.length > 1) groups.push({ type: 'name', key: name, companies });
    }

    return {
      totalGroups: groups.length,
      totalDuplicates: groups.reduce((sum, g) => sum + g.companies.length - 1, 0),
      groups,
    };
  });

  // ── Merge Companies ─────────────────────────────────────────────────────────
  // POST /v1/crm/companies/merge — merge sourceId into targetId.
  // Reassigns all contacts and prospects from source to target,
  // fills in any null fields on target with source values, then deletes source.

  app.post('/v1/crm/companies/merge', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const body = parseBody(request.body, z.object({
      targetId: z.string().min(1),
      sourceId: z.string().min(1),
    }));

    if (body.targetId === body.sourceId) {
      throw new ApiError(400, 'BAD_REQUEST', 'targetId and sourceId must be different.');
    }

    const [target, source] = await Promise.all([
      db.crmCompany.findUnique({ where: { id: body.targetId }, include: { contacts: true } }),
      db.crmCompany.findUnique({ where: { id: body.sourceId }, include: { contacts: true } }),
    ]);

    if (!target) throw new ApiError(404, 'NOT_FOUND', 'Target company not found.');
    if (!source) throw new ApiError(404, 'NOT_FOUND', 'Source company not found.');

    // Fill nulls on target with source values
    const fill: Record<string, unknown> = {};
    const fillFields = ['website', 'industry', 'country', 'city', 'size', 'icpCategory', 'notes'] as const;
    for (const f of fillFields) {
      if (!target[f] && source[f]) fill[f] = source[f];
    }

    await db.$transaction([
      // Reassign contacts
      db.crmContact.updateMany({ where: { companyId: source.id }, data: { companyId: target.id } }),
      // Fill target nulls
      ...(Object.keys(fill).length > 0
        ? [db.crmCompany.update({ where: { id: target.id }, data: fill })]
        : []),
      // Delete source
      db.crmCompany.delete({ where: { id: source.id } }),
    ]);

    const merged = await db.crmCompany.findUnique({
      where: { id: target.id },
      include: { _count: { select: { contacts: true } } },
    });

    return {
      merged,
      contactsReassigned: source.contacts.length,
      fieldsFilled: Object.keys(fill),
    };
  });

  app.get('/v1/crm/companies/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    const { id } = request.params as { id: string };
    const company = await db.crmCompany.findUnique({
      where: { id },
      include: { contacts: { orderBy: { createdAt: 'desc' } } },
    });
    if (!company) throw new ApiError(404, 'NOT_FOUND', 'Company not found.');
    return company;
  });

  app.patch('/v1/crm/companies/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    const body = parseBody(request.body, companyBodySchema.partial());
    return db.crmCompany.update({ where: { id }, data: body });
  });

  app.delete('/v1/crm/companies/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    await db.crmCompany.delete({ where: { id } });
    return { success: true };
  });

  // ── Bulk Import ──────────────────────────────────────────────────────────────

  app.post('/v1/crm/companies/import', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });

    const importItemSchema = z.object({
      company: z.object({
        name: z.string().trim().min(1).max(200),
        website: z.string().trim().max(500).optional(),
        industry: z.string().trim().max(100).optional(),
        country: z.string().trim().max(100).optional(),
        city: z.string().trim().max(100).optional(),
        size: z.string().trim().max(50).optional(),
        icpCategory: z.string().trim().max(100).optional(),
        notes: z.string().max(5000).optional(),
      }),
      contacts: z.array(z.object({
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().max(100).optional(),
        email: z.string().trim().email().optional(),
        linkedinUrl: z.string().trim().max(500).optional(),
        title: z.string().trim().max(100).optional(),
        phone: z.string().trim().max(50).optional(),
        notes: z.string().max(5000).optional(),
      })).optional().default([]),
    });

    const body = parseBody(request.body, z.object({
      items: z.array(importItemSchema).min(1).max(500),
    }));

    // ─── Helper: extract normalized domain from a website string ───
    function extractDomain(website: string): string {
      try {
        return new URL(
          website.startsWith('http') ? website : `https://${website}`
        ).hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return website.toLowerCase().replace(/^www\./, '');
      }
    }

    // ─── Phase 1: Pre-fetch existing data in bulk (fixes N+1) ─────
    const incomingDomains: string[] = [];
    const incomingNamesWithoutWebsite: string[] = [];
    const incomingEmails: string[] = [];

    for (const item of body.items) {
      if (item.company.website) {
        incomingDomains.push(extractDomain(item.company.website));
      } else {
        // Only collect names for items with NO website (fix #2: no aggressive name fallback)
        incomingNamesWithoutWebsite.push(item.company.name.toLowerCase());
      }
      for (const c of item.contacts) {
        if (c.email) incomingEmails.push(c.email.toLowerCase());
      }
    }

    // Bulk-fetch all existing companies (by website or name)
    const allExistingCompanies = await db.crmCompany.findMany({
      where: {
        OR: [
          ...(incomingDomains.length > 0 ? [{ website: { not: null } }] : []),
          ...(incomingNamesWithoutWebsite.length > 0
            ? [{ name: { in: incomingNamesWithoutWebsite, mode: 'insensitive' as const } }]
            : []),
        ],
      },
    });

    // Build lookup maps
    const companyByDomain = new Map<string, typeof allExistingCompanies[0]>();
    for (const co of allExistingCompanies) {
      if (co.website) {
        const d = extractDomain(co.website);
        companyByDomain.set(d, co);
      }
    }
    const companyByName = new Map<string, typeof allExistingCompanies[0]>();
    for (const co of allExistingCompanies) {
      companyByName.set(co.name.toLowerCase(), co);
    }

    // Bulk-fetch all existing contacts by email
    const allExistingContacts = incomingEmails.length > 0
      ? await db.crmContact.findMany({ where: { email: { in: incomingEmails } } })
      : [];
    const contactByEmail = new Map<string, typeof allExistingContacts[0]>();
    for (const ct of allExistingContacts) {
      if (ct.email) contactByEmail.set(ct.email.toLowerCase(), ct);
    }

    // ─── Phase 2: Process items using pre-fetched lookups ─────────
    const results: Array<{
      index: number;
      companyId: string;
      companyName: string;
      created: boolean;
      contactIds: string[];
      errors: string[];
    }> = [];

    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i];
      const errors: string[] = [];

      try {
        // ─ Deduplicate company ─
        // Fix #1: exact domain match (not `contains`)
        // Fix #2: only fall back to name match if item has NO website
        let existingCompany = null;
        if (item.company.website) {
          const domain = extractDomain(item.company.website);
          existingCompany = companyByDomain.get(domain) ?? null;
        } else {
          existingCompany = companyByName.get(item.company.name.toLowerCase()) ?? null;
        }

        const company = existingCompany
          ? existingCompany
          : await db.crmCompany.create({ data: item.company });

        // If we just created a new company, add it to the lookup maps
        // so subsequent items in the same batch can dedup against it
        if (!existingCompany) {
          if (company.website) {
            companyByDomain.set(extractDomain(company.website), company);
          }
          companyByName.set(company.name.toLowerCase(), company);
        }

        // ─ Import contacts ─
        const contactIds: string[] = [];

        for (const contactData of item.contacts) {
          try {
            // Fix #3: dedup contacts with email by email, without email by name+company
            if (contactData.email) {
              const existingContact = contactByEmail.get(contactData.email.toLowerCase());

              if (existingContact) {
                // Link to this company if not already linked
                if (!existingContact.companyId) {
                  await db.crmContact.update({
                    where: { id: existingContact.id },
                    data: { companyId: company.id },
                  });
                  existingContact.companyId = company.id;
                }
                contactIds.push(existingContact.id);
                continue;
              }
            } else {
              // No email — dedup by firstName + lastName within same company
              const existingByName = await db.crmContact.findFirst({
                where: {
                  firstName: { equals: contactData.firstName, mode: 'insensitive' },
                  lastName: contactData.lastName
                    ? { equals: contactData.lastName, mode: 'insensitive' }
                    : null,
                  companyId: company.id,
                },
              });

              if (existingByName) {
                contactIds.push(existingByName.id);
                continue;
              }
            }

            const newContact = await db.crmContact.create({
              data: { ...contactData, companyId: company.id },
            });
            contactIds.push(newContact.id);

            // Add to lookup so subsequent items in batch can dedup
            if (newContact.email) {
              contactByEmail.set(newContact.email.toLowerCase(), newContact);
            }
          } catch (err) {
            errors.push(`Contact ${contactData.firstName} ${contactData.lastName ?? ''}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }

        results.push({
          index: i,
          companyId: company.id,
          companyName: company.name,
          created: !existingCompany,
          contactIds,
          errors,
        });
      } catch (err) {
        results.push({
          index: i,
          companyId: '',
          companyName: item.company.name,
          created: false,
          contactIds: [],
          errors: [`Company: ${err instanceof Error ? err.message : 'Unknown error'}`],
        });
      }
    }

    const totalCompanies = results.filter(r => r.companyId).length;
    const newCompanies = results.filter(r => r.created).length;
    const totalContacts = results.reduce((sum, r) => sum + r.contactIds.length, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    return {
      summary: {
        totalItems: body.items.length,
        companiesProcessed: totalCompanies,
        companiesCreated: newCompanies,
        companiesExisting: totalCompanies - newCompanies,
        contactsProcessed: totalContacts,
        errors: totalErrors,
      },
      results,
    };
  });

  // ── Contacts ────────────────────────────────────────────────────────────────

  app.get('/v1/crm/contacts', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    const query = parseQuery(request.query, z.object({
      companyId: z.string().optional(),
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      cursor: z.string().optional(),
    }));

    return db.crmContact.findMany({
      where: {
        ...(query.companyId && { companyId: query.companyId }),
        ...(query.q && {
          OR: [
            { firstName: { contains: query.q, mode: 'insensitive' } },
            { lastName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ],
        }),
        ...(query.cursor && { id: { lt: query.cursor } }),
      },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
  });

  app.post('/v1/crm/contacts', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const body = parseBody(request.body, contactBodySchema);
    return db.crmContact.create({ data: body, include: { company: true } });
  });

  app.get('/v1/crm/contacts/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    const { id } = request.params as { id: string };
    const contact = await db.crmContact.findUnique({
      where: { id },
      include: { company: true, prospects: { include: { campaign: true, emails: { orderBy: { createdAt: 'desc' }, take: 5 } } } },
    });
    if (!contact) throw new ApiError(404, 'NOT_FOUND', 'Contact not found.');
    return contact;
  });

  app.patch('/v1/crm/contacts/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    const body = parseBody(request.body, contactBodySchema.partial());
    return db.crmContact.update({ where: { id }, data: body, include: { company: true } });
  });

  app.delete('/v1/crm/contacts/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    await db.crmContact.delete({ where: { id } });
    return { success: true };
  });

  // ── Campaigns ───────────────────────────────────────────────────────────────

  app.get('/v1/crm/campaigns', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    const query = parseQuery(request.query, z.object({
      q: z.string().trim().max(200).optional(),
      status: campaignStatusSchema.optional(),
      platform: z.string().trim().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      cursor: z.string().optional(),
      paginate: z.coerce.boolean().default(false),
    }));

    const where = {
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' as const } },
          { vertical: { contains: query.q, mode: 'insensitive' as const } },
          { description: { contains: query.q, mode: 'insensitive' as const } },
          { platform: { contains: query.q, mode: 'insensitive' as const } },
        ],
      }),
      ...(query.status && { status: query.status }),
      ...(query.platform && { platform: { equals: query.platform, mode: 'insensitive' as const } }),
    };

    if (query.paginate) {
      const [items, total, platforms] = await Promise.all([
        db.crmCampaign.findMany({
          where,
          include: {
            _count: { select: { prospects: true, steps: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.limit + 1,
          ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        }),
        db.crmCampaign.count({ where }),
        db.crmCampaign.findMany({
          where: { platform: { not: null } },
          select: { platform: true },
          distinct: ['platform'],
          orderBy: { platform: 'asc' },
        }),
      ]);

      const hasMore = items.length > query.limit;
      const pageItems = hasMore ? items.slice(0, query.limit) : items;

      return {
        items: pageItems,
        total,
        nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null,
        filters: {
          platforms: platforms.map((entry) => entry.platform).filter((value): value is string => Boolean(value)),
          statuses: campaignStatusSchema.options,
        },
      };
    }

    return db.crmCampaign.findMany({
      where,
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        _count: { select: { prospects: true, steps: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
  });

  app.post('/v1/crm/campaigns', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const body = parseBody(request.body, campaignBodySchema);
    const { steps, ...campaignData } = body;
    return db.crmCampaign.create({
      data: {
        ...campaignData,
        ...(steps && {
          steps: { create: steps },
        }),
      },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });
  });

  app.get('/v1/crm/campaigns/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    const { id } = request.params as { id: string };
    const query = parseQuery(request.query, z.object({
      stepQ: z.string().trim().max(200).optional(),
      stepLimit: z.coerce.number().int().min(1).max(50).default(6),
      stepCursor: z.string().optional(),
      includeProspects: z.coerce.boolean().default(true),
    }));

    const stepWhere = {
      campaignId: id,
      ...(query.stepQ && {
        OR: [
          { subjectLine: { contains: query.stepQ, mode: 'insensitive' as const } },
          { bodyTemplate: { contains: query.stepQ, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [campaign, stepsTotal] = await Promise.all([
      db.crmCampaign.findUnique({
        where: { id },
        include: {
          _count: { select: { prospects: true, steps: true } },
          steps: {
            where: query.stepQ
              ? {
                  OR: [
                    { subjectLine: { contains: query.stepQ, mode: 'insensitive' } },
                    { bodyTemplate: { contains: query.stepQ, mode: 'insensitive' } },
                  ],
                }
              : undefined,
            orderBy: [{ stepNumber: 'asc' }, { id: 'asc' }],
            take: query.stepLimit + 1,
            ...(query.stepCursor ? { cursor: { id: query.stepCursor }, skip: 1 } : {}),
          },
          ...(query.includeProspects
            ? {
                prospects: {
                  include: { contact: { include: { company: true } } },
                  orderBy: { createdAt: 'desc' },
                },
              }
            : {}),
        },
      }),
      db.crmCampaignStep.count({ where: stepWhere }),
    ]);
    if (!campaign) throw new ApiError(404, 'NOT_FOUND', 'Campaign not found.');

    const hasMoreSteps = campaign.steps.length > query.stepLimit;
    const steps = hasMoreSteps ? campaign.steps.slice(0, query.stepLimit) : campaign.steps;

    return {
      ...campaign,
      prospects: query.includeProspects ? (campaign as { prospects?: unknown[] }).prospects ?? [] : [],
      steps,
      stepsTotal,
      stepsNextCursor: hasMoreSteps ? steps[steps.length - 1]?.id ?? null : null,
      stepsHasMore: hasMoreSteps,
    };
  });

  app.patch('/v1/crm/campaigns/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    const body = parseBody(request.body, z.object({
      name: z.string().trim().min(1).max(200).optional(),
      vertical: z.string().trim().max(100).optional(),
      description: z.string().max(2000).optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']).optional(),
    }));
    return db.crmCampaign.update({ where: { id }, data: body });
  });

  app.delete('/v1/crm/campaigns/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    // Delete outreach emails for prospects in this campaign first
    await db.crmOutreachEmail.deleteMany({
      where: { prospect: { campaignId: id } },
    });
    // Delete prospects in this campaign
    await db.crmProspect.deleteMany({ where: { campaignId: id } });
    // Delete campaign (cascade deletes steps via schema)
    await db.crmCampaign.delete({ where: { id } });
    return { success: true };
  });

  app.post('/v1/crm/campaigns/:id/enroll', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    const body = parseBody(request.body, enrollBodySchema);

    const campaign = await db.crmCampaign.findUnique({ where: { id }, include: { steps: { orderBy: { stepNumber: 'asc' }, take: 1 } } });
    if (!campaign) throw new ApiError(404, 'NOT_FOUND', 'Campaign not found.');

    const firstStep = campaign.steps[0];
    const nextStepAt = firstStep ? new Date() : null;

    const results = [];
    for (const contactId of body.contactIds) {
      const existing = await db.crmProspect.findFirst({
        where: { contactId, campaignId: id },
      });
      if (existing) {
        const updated = await db.crmProspect.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', nextStepAt },
        });
        results.push(updated);
      } else {
        const created = await db.crmProspect.create({
          data: { contactId, campaignId: id, nextStepAt },
        });
        results.push(created);
      }
    }

    return { enrolled: results.length, prospects: results };
  });

  // ── Prospects ───────────────────────────────────────────────────────────────

  app.get('/v1/crm/prospects', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    const query = parseQuery(request.query, z.object({
      stage: prospectStageSchema.optional(),
      campaignId: z.string().optional(),
      status: prospectStatusSchema.optional(),
      q: z.string().trim().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      cursor: z.string().optional(),
      paginate: z.coerce.boolean().default(false),
    }));

    const where = {
      ...(query.stage && { stage: query.stage }),
      ...(query.campaignId && { campaignId: query.campaignId }),
      ...(query.status && { status: query.status }),
      ...(query.q && {
        OR: [
          { contact: { is: { firstName: { contains: query.q, mode: 'insensitive' as const } } } },
          { contact: { is: { lastName: { contains: query.q, mode: 'insensitive' as const } } } },
          { contact: { is: { email: { contains: query.q, mode: 'insensitive' as const } } } },
          { contact: { is: { title: { contains: query.q, mode: 'insensitive' as const } } } },
          { contact: { is: { company: { is: { name: { contains: query.q, mode: 'insensitive' as const } } } } } },
        ],
      }),
    };

    const baseQuery = {
      where,
      include: {
        contact: { include: { company: true } },
        campaign: true,
        emails: { orderBy: { createdAt: 'desc' as const }, take: 1 },
      },
      orderBy: [{ updatedAt: 'desc' as const }, { id: 'desc' as const }],
      take: query.limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    };

    if (query.paginate) {
      const [items, total] = await Promise.all([
        db.crmProspect.findMany({ ...baseQuery, take: query.limit + 1 }),
        db.crmProspect.count({ where }),
      ]);

      const hasMore = items.length > query.limit;
      const pageItems = hasMore ? items.slice(0, query.limit) : items;

      return {
        items: pageItems,
        total,
        nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null,
        filters: {
          stages: prospectStageSchema.options,
          statuses: prospectStatusSchema.options,
        },
      };
    }

    return db.crmProspect.findMany(baseQuery);
  });

  app.get('/v1/crm/prospects/due', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    return db.crmProspect.findMany({
      where: {
        status: 'ACTIVE',
        nextStepAt: { lte: new Date() },
      },
      include: {
        contact: { include: { company: true } },
        campaign: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
        emails: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { nextStepAt: 'asc' },
    });
  });

  app.patch('/v1/crm/prospects/:id/stage', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    const body = parseBody(request.body, z.object({ stage: prospectStageSchema }));
    return db.crmProspect.update({ where: { id }, data: { stage: body.stage } });
  });

  app.patch('/v1/crm/prospects/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    const body = parseBody(request.body, prospectUpdateSchema);
    return db.crmProspect.update({
      where: { id },
      data: {
        ...body,
        ...(body.nextStepAt !== undefined && {
          nextStepAt: body.nextStepAt ? new Date(body.nextStepAt) : null,
        }),
      },
    });
  });

  // ── Outreach Emails ─────────────────────────────────────────────────────────

  app.get('/v1/crm/emails', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    const query = parseQuery(request.query, z.object({ prospectId: z.string().min(1) }));
    return db.crmOutreachEmail.findMany({
      where: { prospectId: query.prospectId },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/v1/crm/emails', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const body = parseBody(request.body, outreachEmailBodySchema);
    const email = await db.crmOutreachEmail.create({
      data: {
        ...body,
        ...(body.sentAt && { sentAt: new Date(body.sentAt) }),
      },
    });
    // Move prospect to OUTREACH stage if still at PROSPECT
    await db.crmProspect.updateMany({
      where: { id: body.prospectId, stage: 'PROSPECT' },
      data: { stage: 'OUTREACH' },
    });
    return email;
  });

  app.patch('/v1/crm/emails/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    const body = parseBody(request.body, z.object({
      openedAt: z.string().datetime().optional(),
      repliedAt: z.string().datetime().optional(),
      bouncedAt: z.string().datetime().optional(),
    }));
    return db.crmOutreachEmail.update({
      where: { id },
      data: {
        ...(body.openedAt && { openedAt: new Date(body.openedAt) }),
        ...(body.repliedAt && { repliedAt: new Date(body.repliedAt) }),
        ...(body.bouncedAt && { bouncedAt: new Date(body.bouncedAt) }),
      },
    });
  });

  // ── Email Accounts ──────────────────────────────────────────────────────────

  app.get('/v1/crm/email-accounts', async (request) => {
    await requireAuth(request, { botScope: 'content.read' });
    return db.crmEmailAccount.findMany({ orderBy: { createdAt: 'desc' } });
  });

  app.post('/v1/crm/email-accounts', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const body = parseBody(request.body, emailAccountBodySchema);
    return db.crmEmailAccount.create({ data: body });
  });

  app.patch('/v1/crm/email-accounts/:id', async (request) => {
    await requireAuth(request, { botScope: 'content.write' });
    const { id } = request.params as { id: string };
    const body = parseBody(request.body, emailAccountBodySchema.partial());
    return db.crmEmailAccount.update({ where: { id }, data: body });
  });

}
