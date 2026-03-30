'use client';

import { useState, type ReactNode } from 'react';
import { TabList, Tab, TabPanel } from '@/components/ui';

interface BotDetailTabsProps {
  overviewContent: ReactNode;
  membersContent: ReactNode;
  keysContent: ReactNode;
  defaultTab?: string;
}

export function BotDetailTabs({ overviewContent, membersContent, keysContent, defaultTab = 'overview' }: BotDetailTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div>
      <TabList>
        <Tab value="overview" activeTab={activeTab} onClick={setActiveTab}>Overview</Tab>
        <Tab value="members" activeTab={activeTab} onClick={setActiveTab}>Members</Tab>
        <Tab value="keys" activeTab={activeTab} onClick={setActiveTab}>API Keys</Tab>
      </TabList>
      <TabPanel value="overview" activeTab={activeTab}>
        <div className="py-4">{overviewContent}</div>
      </TabPanel>
      <TabPanel value="members" activeTab={activeTab}>
        <div className="py-4">{membersContent}</div>
      </TabPanel>
      <TabPanel value="keys" activeTab={activeTab}>
        <div className="py-4">{keysContent}</div>
      </TabPanel>
    </div>
  );
}
