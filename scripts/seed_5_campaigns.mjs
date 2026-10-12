import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
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
}

import { createRemoteD1 } from '../backend/worker/src/adapters/remoteD1.js';

const db = createRemoteD1({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
});

async function main() {
  console.log("Updating campaigns in D1...");
  const now = Date.now();
  const thirtyDaysLater = now + (30 * 24 * 60 * 60 * 1000);
  const festiveExpiry = now + (14 * 24 * 60 * 60 * 1000); // 2 weeks for festive

  const campaigns = [
    {
      id: 'camp_fest_30_off',
      title: 'BLINTZY Campus Fest',
      metadata: {
        message: 'Celebrate campus life! Special student savings on all printing & academic notes.',
        cta_label: 'View Offers',
        cta_url: '/app/offers',
        image_key: '/images/banners/banner_campus_fest.jpg',
        theme: 'orange_gradient',
        icon: 'Sparkles',
        badge: 'Campus Fest'
      },
      priority: 50,
      start_time: now,
      end_time: thirtyDaysLater
    },
    {
      id: 'camp_smart_printing',
      title: 'Smart Printing',
      metadata: {
        message: 'Fast lab records, lecture notes & project manuals ready before your class.',
        cta_label: 'Order Prints',
        cta_url: '/app/services',
        image_key: '/images/banners/banner_smart_printing.jpg',
        theme: 'smart_printing',
        icon: 'Compass',
        badge: 'Instant Print'
      },
      priority: 45,
      start_time: now,
      end_time: thirtyDaysLater
    },
    {
      id: 'camp_dussehra_dandiya_special',
      title: 'Dussehra & Dandiya Special',
      metadata: {
        message: 'Celebrate the festive rhythm! Limited-time festive campus offers on all print orders.',
        cta_label: 'Explore Festive Deals',
        cta_url: '/app/offers',
        image_key: '/images/banners/banner_dandiya_festive.jpg',
        theme: 'amber_festive',
        icon: 'Music2',
        badge: 'Festive Special'
      },
      priority: 40,
      start_time: now,
      end_time: festiveExpiry
    },
    {
      id: 'camp_refer_earn',
      title: 'Refer & Earn',
      metadata: {
        message: 'Invite campus friends and earn free printing credits on their first order.',
        cta_label: 'Coming Soon',
        cta_url: '',
        image_key: '/images/banners/banner_refer_earn.jpg',
        theme: 'cream_emerald',
        icon: 'Gift',
        badge: 'Coming Soon'
      },
      priority: 35,
      start_time: now,
      end_time: thirtyDaysLater
    },
    {
      id: 'camp_ambassador_program',
      title: 'Campus Ambassador',
      metadata: {
        message: 'Be the voice of Blintzy at your college. Applications opening soon for next term.',
        cta_label: 'Coming Soon',
        cta_url: '',
        image_key: '/images/banners/banner_campus_ambassador.jpg',
        theme: 'royal_indigo',
        icon: 'Users',
        badge: 'Coming Soon'
      },
      priority: 30,
      start_time: now,
      end_time: thirtyDaysLater
    }
  ];

  // Remove old campaigns and insert 5 clean campaigns
  await db.prepare("DELETE FROM website_content WHERE content_type = 'campaign'").run();

  for (const c of campaigns) {
    await db.prepare(`
      INSERT INTO website_content (id, content_type, title, metadata, priority, status, start_time, end_time, created_at, updated_at)
      VALUES (?, 'campaign', ?, ?, ?, 'active', ?, ?, ?, ?)
    `).bind(
      c.id,
      c.title,
      JSON.stringify(c.metadata),
      c.priority,
      c.start_time,
      c.end_time,
      now,
      now
    ).run();
  }

  console.log("Successfully seeded 5 distinct premium campaign cards with student photography!");
}

main().catch(console.error);
