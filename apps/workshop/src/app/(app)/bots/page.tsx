// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Label,
  Select,
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
  SubmitButton,
} from '@/components/ui';
import { SectionTabsNav } from '@/components/navigation/section-tabs-nav';
import { requirePermission } from '@/lib/auth';
import { ROUTE_PERMISSIONS } from '@/lib/access';
import { getSessionApiClient } from '@/lib/api-client';
import { addBotMemberAction, createBotKeyAction, revokeBotKeyAction } from './actions';
import { BotDetailTabs } from './bot-detail';
import { CreateBotModal } from './create-bot-modal';

interface Props {
  searchParams: Promise<{
    success?: string;
    error?: string;
    bot?: string;
    key?: string;
  }>;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export default async function BotsPage({ searchParams }: Props) {
  await requirePermission(ROUTE_PERMISSIONS.bots);
  const api = await getSessionApiClient();
  const bots = await api.listBots();
  const { success, error, bot: botFromQuery, key } = await searchParams;

  const selectedBotId = botFromQuery && bots.some((item) => item.id === botFromQuery) ? botFromQuery : bots[0]?.id;
  const selectedBot = selectedBotId ? await api.getBot(selectedBotId) : null;
  const keys = selectedBotId ? await api.listBotKeys(selectedBotId) : [];

  return (
    <main className="space-y-4">
      {success ? <Alert tone="success">{success}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {key ? (
        <Alert tone="success">
          Raw key (shown once): <code className="text-[12px] break-all">{key}</code>
        </Alert>
      ) : null}

      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[18px] font-semibold tracking-tight @sm:text-[22px]">Bots</h1>
        <CreateBotModal />
      </div>

      {/* Bot selector */}
      {bots.length > 0 ? (
        <SectionTabsNav
          items={bots.map((bot) => ({
            value: bot.id,
            label: bot.name,
            href: `/bots?bot=${encodeURIComponent(bot.id)}`,
          }))}
          active={selectedBotId ?? ''}
          ariaLabel="Bot navigation"
        />
      ) : (
        <p className="text-[13px] text-muted">No bots yet. Create one to get started.</p>
      )}

      {/* Selected bot detail with tabs */}
      {selectedBot ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate font-display text-[16px] font-semibold tracking-tight @sm:text-[18px]">{selectedBot.name}</h2>
                <p className="mt-0.5 text-[13px] text-muted">/{selectedBot.slug}</p>
              </div>
              <Badge tone="teal">{selectedBot.status}</Badge>
            </div>
          </CardHeader>
          <CardBody className="pt-0">
            <BotDetailTabs
              overviewContent={
                <div className="space-y-4">
                  <dl className="grid gap-3 @sm:grid-cols-2">
                    <div>
                      <dt className="text-[12px] font-medium text-[var(--app-muted)]">Created by</dt>
                      <dd className="mt-0.5 text-[13px]">{selectedBot.createdByUser.email}</dd>
                    </div>
                    <div>
                      <dt className="text-[12px] font-medium text-[var(--app-muted)]">Status</dt>
                      <dd className="mt-0.5"><Badge tone="teal">{selectedBot.status}</Badge></dd>
                    </div>
                    <div>
                      <dt className="text-[12px] font-medium text-[var(--app-muted)]">Slug</dt>
                      <dd className="mt-0.5 text-[13px] font-mono">/{selectedBot.slug}</dd>
                    </div>
                    <div>
                      <dt className="text-[12px] font-medium text-[var(--app-muted)]">Members</dt>
                      <dd className="mt-0.5 text-[13px]">{selectedBot.members.length}</dd>
                    </div>
                  </dl>
                </div>
              }
              membersContent={
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-[13px] font-medium">Add member</h3>
                    <form action={addBotMemberAction} className="flex flex-col gap-2 @sm:flex-row @sm:items-end">
                      <input type="hidden" name="botId" value={selectedBot.id} />
                      <Input name="userEmail" type="email" required placeholder="member@company.com" />
                      <Select name="membershipRole" defaultValue="VIEWER">
                        <option value="OWNER">Owner</option>
                        <option value="MAINTAINER">Maintainer</option>
                        <option value="VIEWER">Viewer</option>
                      </Select>
                      <SubmitButton size="sm">Add</SubmitButton>
                    </form>
                  </div>
                  <TableWrap>
                    <Table>
                      <THead>
                        <TR className="border-b-0">
                          <TH>User</TH>
                          <TH>Role</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {selectedBot.members.map((member) => (
                          <TR key={member.id}>
                            <TD>{member.user.email}</TD>
                            <TD><Badge tone="teal">{member.membershipRole}</Badge></TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableWrap>
                </div>
              }
              keysContent={
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-[13px] font-medium">Generate key</h3>
                    <form action={createBotKeyAction} className="flex flex-col gap-2 @sm:flex-row @sm:items-end">
                      <input type="hidden" name="botId" value={selectedBot.id} />
                      <Input name="name" required placeholder="Key name" />
                      <Input name="scopes" placeholder="content.read,content.write" />
                      <SubmitButton size="sm">Generate</SubmitButton>
                    </form>
                  </div>
                  <TableWrap>
                    <Table>
                      <THead>
                        <TR className="border-b-0">
                          <TH>Name</TH>
                          <TH>Prefix</TH>
                          <TH>Last used</TH>
                          <TH></TH>
                        </TR>
                      </THead>
                      <TBody>
                        {keys.map((item) => (
                          <TR key={item.id}>
                            <TD>{item.name}</TD>
                            <TD className="font-mono text-[12px]">{item.keyPrefix}</TD>
                            <TD>{formatDate(item.lastUsedAt)}</TD>
                            <TD>
                              {item.revokedAt ? (
                                <Badge tone="neutral">Revoked</Badge>
                              ) : (
                                <form action={revokeBotKeyAction}>
                                  <input type="hidden" name="botId" value={selectedBot.id} />
                                  <input type="hidden" name="keyId" value={item.id} />
                                  <SubmitButton size="xs" variant="subtle">Revoke</SubmitButton>
                                </form>
                              )}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableWrap>
                </div>
              }
            />
          </CardBody>
        </Card>
      ) : null}
    </main>
  );
}
