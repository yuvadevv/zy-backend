import { createRemoteD1 } from './backend/worker/src/adapters/remoteD1.js';
import fs from 'fs';
import crypto from 'crypto';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('='))
);

const db = createRemoteD1({
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: env.CLOUDFLARE_DATABASE_ID,
  apiToken: env.CLOUDFLARE_D1_API_TOKEN
});

const adminId = 'seed_admin_id'; // Placeholder for admin id
const now = Date.now();

const highlights = [
  {
    title: 'First-Year Manuals Are Trending',
    description: 'Popular first-year semester manuals are ready to browse.',
    ctaLabel: 'Browse Manuals',
    linkUrl: '/app/services/manuals',
    theme: 'green',
    icon: 'book',
    priority: 1
  },
  {
    title: 'Your Semester Starts Here',
    description: 'Find the manuals you need for your next classes.',
    ctaLabel: 'Explore Manuals',
    linkUrl: '/app/services/manuals',
    theme: 'orange',
    icon: 'sparkles',
    priority: 2
  },
  {
    title: 'Hall Tickets Are Here',
    description: 'Download your hall ticket and get it print-ready.',
    ctaLabel: 'Get Tickets',
    linkUrl: '/app/services/hall-tickets',
    theme: 'purple',
    icon: 'ticket',
    priority: 3
  },
  {
    title: 'Need a Print?',
    description: "Upload your document and we'll take care of the rest.",
    ctaLabel: 'Print Now',
    linkUrl: '/app/services/upload',
    theme: 'blue',
    icon: 'printer',
    priority: 4
  },
  {
    title: 'Print Before 8 PM',
    description: 'Get your classroom delivery ready for tomorrow.',
    ctaLabel: 'Print Now',
    linkUrl: '/app/services/upload',
    theme: 'orange',
    icon: 'clock',
    priority: 5
  },
  {
    title: 'Popular This Week',
    description: 'See what students are printing and using most.',
    ctaLabel: 'Explore',
    linkUrl: '/app/services/manuals',
    theme: 'neutral',
    icon: 'sparkles', 
    priority: 6
  },
  {
    title: 'Assignments Ready?',
    description: 'Upload your PDF in seconds and get it print-ready.',
    ctaLabel: 'Upload Now',
    linkUrl: '/app/services/upload',
    theme: 'blue',
    icon: 'document',
    priority: 7
  },
  {
    title: 'Fresh Updates From BLINTZY',
    description: 'New academic content and services are added here.',
    ctaLabel: 'Explore',
    linkUrl: '/app/services/manuals',
    theme: 'purple',
    icon: 'bell',
    priority: 8
  }
];

async function seed() {
  try {
    // Delete existing highlights first to avoid duplicates
    console.log('Cleaning up old highlights...');
    await db.prepare("DELETE FROM website_content WHERE content_type = 'highlight'").run();

    console.log('Inserting new highlights...');
    for (const h of highlights) {
      const id = crypto.randomUUID();
      const metadata = {
        subtitle: h.description,
        url: h.linkUrl,
        cta: h.ctaLabel,
        theme: h.theme,
        icon: h.icon
      };

      await db.prepare(`
        INSERT INTO website_content 
        (id, content_type, title, metadata, priority, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        'highlight',
        h.title,
        JSON.stringify(metadata),
        h.priority,
        'active',
        adminId,
        now,
        now
      ).run();
      console.log(`Inserted: ${h.title}`);
    }
    console.log('Seeding complete!');
  } catch (err) {
    console.error('Error seeding highlights:', err);
  }
}

seed();
