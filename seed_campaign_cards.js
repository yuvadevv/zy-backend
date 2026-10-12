import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
const content = fs.readFileSync(envPath, 'utf8');
for (const line of content.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { createRemoteD1 } from './backend/worker/src/adapters/remoteD1.js';
const db = createRemoteD1({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
});

async function seedCampaigns() {
  console.log("Seeding authentic 5 campaign cards into website_content...");
  const now = Date.now();
  const future = now + 90 * 86400000; // 90 days validity

  const campaigns = [
    {
      id: 'camp_dussehra_dandiya_special',
      title: 'Dussehra & Dandiya Special',
      content_type: 'campaign',
      priority: 50,
      metadata: JSON.stringify({
        subtitle: 'Celebrate the festive rhythm! Special campus discounts on all print services.',
        cta_label: 'Explore Festive Deals',
        cta_url: '/app/offers',
        badge: 'Festive Special',
        theme: 'amber_festive',
        icon: 'Music2',
        campaign_type: 'festive_dandiya'
      })
    },
    {
      id: 'camp_fest_30_off',
      title: 'BLINTZY CAMPUS FEST',
      content_type: 'campaign',
      priority: 45,
      metadata: JSON.stringify({
        subtitle: 'Get up to 30% OFF on all student printing services. Verified offer active!',
        cta_label: 'View 30% Offer',
        cta_url: '/app/offers',
        badge: '30% OFF',
        theme: 'orange_gradient',
        icon: 'Sparkles',
        campaign_type: 'campus_fest_offer'
      })
    },
    {
      id: 'camp_refer_earn',
      title: 'Refer & Earn',
      content_type: 'campaign',
      priority: 30,
      metadata: JSON.stringify({
        subtitle: 'Invite your classmates and earn free printing credits on their first order.',
        cta_label: 'Coming Soon',
        cta_url: '',
        badge: 'Coming Soon',
        theme: 'cream_emerald',
        icon: 'Gift',
        campaign_type: 'referral'
      })
    },
    {
      id: 'camp_ambassador_program',
      title: 'Campus Ambassador',
      content_type: 'campaign',
      priority: 25,
      metadata: JSON.stringify({
        subtitle: 'Represent Blintzy at your branch, lead college events and unlock leadership perks.',
        cta_label: 'Coming Soon',
        cta_url: '',
        badge: 'Coming Soon',
        theme: 'royal_indigo',
        icon: 'Users',
        campaign_type: 'ambassador'
      })
    },
    {
      id: 'camp_upcoming_services',
      title: 'Upcoming Campus Services',
      content_type: 'campaign',
      priority: 20,
      metadata: JSON.stringify({
        subtitle: 'Lab record bindings, college bus GPS tracking and express classroom delivery.',
        cta_label: 'Explore Services',
        cta_url: '/app/services',
        badge: 'New Features',
        theme: 'charcoal_dark',
        icon: 'Compass',
        campaign_type: 'services'
      })
    }
  ];

  for (const c of campaigns) {
    await db.prepare(`
      INSERT INTO website_content (
        id, title, content_type, status, priority, metadata, start_time, end_time, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        status = 'active',
        priority = excluded.priority,
        metadata = excluded.metadata,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        updated_at = excluded.updated_at
    `).bind(
      c.id, c.title, c.content_type, c.priority, c.metadata, now - 86400000, future, now, now
    ).run();
    console.log(`Seeded/Updated campaign: ${c.title} (${c.id})`);
  }

  console.log("Campaign seeding complete!");
}

seedCampaigns();
