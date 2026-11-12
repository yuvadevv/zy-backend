import { createRemoteD1 } from '../backend/worker/src/adapters/remoteD1.js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=');
  if (idx !== -1) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const db = createRemoteD1({
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: env.CLOUDFLARE_DATABASE_ID,
  apiToken: env.CLOUDFLARE_D1_API_TOKEN
});

const CHOPSTICKS_PRODUCTS = [
  // CHICKEN ITEMS
  {
    id: 'chopsticks_chk_01',
    vendor_id: 'vendor_canteen_stall',
    name: 'Chicken Dum Biryani',
    description: 'Aromatic slow-cooked basmati rice layered with marinated tender chicken, saffron, browned onions and whole spices.',
    price: 150,
    category_id: 'biryani',
    dietary: 'non-veg',
    image: '/images/food/chicken_dum_biryani.jpg',
    is_available: 1,
    stock: 60,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_02',
    vendor_id: 'vendor_canteen_stall',
    name: 'Chicken Fry Biryani',
    description: 'Crispy seasoned South Indian chicken fry pieces served over rich, fragrant biryani rice with curry leaves and fried onions.',
    price: 150,
    category_id: 'biryani',
    dietary: 'non-veg',
    image: '/images/food/chicken_fry_biryani.jpg',
    is_available: 1,
    stock: 50,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_03',
    vendor_id: 'vendor_canteen_stall',
    name: 'Chicken Fried Rice',
    description: 'Wok-tossed basmati rice with seasoned diced chicken, scrambled egg, crisp spring onions and light soy sauce.',
    price: 100,
    category_id: 'fried-rice',
    dietary: 'non-veg',
    image: '/images/food/chicken_fried_rice.jpg',
    is_available: 1,
    stock: 60,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_04',
    vendor_id: 'vendor_canteen_stall',
    name: 'Chicken Noodles',
    description: 'Classic wok-stirred noodles with juicy chicken strips, shredded cabbage, carrots, scallions and pepper soy glaze.',
    price: 100,
    category_id: 'noodles',
    dietary: 'non-veg',
    image: '/images/food/chicken_noodles.jpg',
    is_available: 1,
    stock: 60,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_05',
    vendor_id: 'vendor_canteen_stall',
    name: 'Chicken Manchurian',
    description: 'Crispy fried chicken balls tossed in a savory, tangy and spicy Indo-Chinese Manchurian sauce with garlic and spring onions.',
    price: 130,
    category_id: 'starters',
    dietary: 'non-veg',
    image: '/images/food/chicken_manchurian.jpg',
    is_available: 1,
    stock: 45,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_06',
    vendor_id: 'vendor_canteen_stall',
    name: 'Chicken Mughalai Biryani',
    description: 'Royal Mughlai style aromatic biryani enriched with cashew paste, whole spices, fried egg, saffron and succulent chicken.',
    price: 180,
    category_id: 'biryani',
    dietary: 'non-veg',
    image: '/images/food/chicken_mughalai_biryani.jpg',
    is_available: 1,
    stock: 40,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_07',
    vendor_id: 'vendor_canteen_stall',
    name: 'Chilli Chicken',
    description: 'Wok-seared crispy chicken bites tossed with green bell peppers, diced onions, slit green chilies and dark soy sauce.',
    price: 150,
    category_id: 'starters',
    dietary: 'non-veg',
    image: '/images/food/chilli_chicken.jpg',
    is_available: 1,
    stock: 50,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_08',
    vendor_id: 'vendor_canteen_stall',
    name: 'Chicken 65',
    description: 'Famous spicy deep-fried chicken morsels flavored with roasted curry leaves, ginger-garlic, red chili and lemon juice.',
    price: 160,
    category_id: 'starters',
    dietary: 'non-veg',
    image: '/images/food/chicken_65.jpg',
    is_available: 1,
    stock: 50,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_09',
    vendor_id: 'vendor_canteen_stall',
    name: 'Pepper Chicken Dry',
    description: 'Fiery Andhra-style pan-roasted chicken tossed with freshly crushed black peppercorns, curry leaves and caramelized shallots.',
    price: 150,
    category_id: 'starters',
    dietary: 'non-veg',
    image: '/images/food/pepper_chicken_dry.jpg',
    is_available: 1,
    stock: 45,
    meal_type: 'all_day'
  },

  // VEG ITEMS
  {
    id: 'chopsticks_veg_01',
    vendor_id: 'vendor_canteen_stall',
    name: 'Paneer Biryani',
    description: 'Fragrant basmati rice layered with spiced, tender paneer cubes, saffron milk, fresh mint and fried brown onions.',
    price: 160,
    category_id: 'biryani',
    dietary: 'veg',
    image: '/images/food/paneer_biryani.jpg',
    is_available: 1,
    stock: 40,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_veg_02',
    vendor_id: 'vendor_canteen_stall',
    name: 'Mushroom Biryani',
    description: 'Savory button mushrooms cooked in an authentic biryani masala and layered with aromatic long-grain basmati rice.',
    price: 160,
    category_id: 'biryani',
    dietary: 'veg',
    image: '/images/food/mushroom_biryani.jpg',
    is_available: 1,
    stock: 40,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_veg_03',
    vendor_id: 'vendor_canteen_stall',
    name: 'Veg Fried Rice',
    description: 'Light and aromatic wok-fried basmati rice with finely chopped carrots, French beans, cabbage, sweet corn and scallions.',
    price: 70,
    category_id: 'fried-rice',
    dietary: 'veg',
    image: '/images/food/veg_fried_rice.jpg',
    is_available: 1,
    stock: 60,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_veg_04',
    vendor_id: 'vendor_canteen_stall',
    name: 'Veg Noodles',
    description: 'Street-style wok-tossed Hakka noodles with crunchy shredded vegetables, spring onions and savory seasoning.',
    price: 70,
    category_id: 'noodles',
    dietary: 'veg',
    image: '/images/food/veg_noodles.jpg',
    is_available: 1,
    stock: 60,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_veg_05',
    vendor_id: 'vendor_canteen_stall',
    name: 'Veg Manchurian',
    description: 'Golden fried mixed vegetable dumplings coated in a glossy, garlicky and tangy Indo-Chinese Manchurian sauce.',
    price: 90,
    category_id: 'starters',
    dietary: 'veg',
    image: '/images/food/veg_manchurian.jpg',
    is_available: 1,
    stock: 50,
    meal_type: 'all_day'
  },

  // EGG ITEMS
  {
    id: 'chopsticks_egg_01',
    vendor_id: 'vendor_canteen_stall',
    name: 'Egg Fried Rice',
    description: 'Wok-tossed basmati rice with fluffy scrambled egg ribbons, green spring onions and mild oriental seasonings.',
    price: 90,
    category_id: 'fried-rice',
    dietary: 'egg',
    image: '/images/food/egg_fried_rice.jpg',
    is_available: 1,
    stock: 50,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_egg_02',
    vendor_id: 'vendor_canteen_stall',
    name: 'Egg Noodles',
    description: 'Savory stir-fried noodles cooked with scrambled farm fresh eggs, shredded cabbage, carrots and pepper.',
    price: 90,
    category_id: 'noodles',
    dietary: 'egg',
    image: '/images/food/egg_noodles.jpg',
    is_available: 1,
    stock: 50,
    meal_type: 'all_day'
  },

  // PRAWN ITEMS
  {
    id: 'chopsticks_pwn_01',
    vendor_id: 'vendor_canteen_stall',
    name: 'Prawn Biryani',
    description: 'Coastal specialty dum biryani featuring juicy spiced prawns, aromatic long-grain rice, fresh mint, coriander and caramelized onions.',
    price: 180,
    category_id: 'biryani',
    dietary: 'non-veg',
    image: '/images/food/prawn_biryani.jpg',
    is_available: 1,
    stock: 35,
    meal_type: 'all_day'
  }
];

const RCE_MESS_WEEKLY_MENU = [
  {
    id: 'monday',
    vendor_id: 'vendor_college_mess',
    day_of_week: 'Monday',
    title: 'Monday Special Menu',
    items: JSON.stringify([
      'Pappu Tamata',
      'Cabbage 65',
      'Rasam',
      'Roti Pachadi (Chutney)',
      'Perugu Annam',
      'Rice'
    ]),
    image: '/images/food/rce_mess_cover.webp',
    notes: 'Homestyle Andhra vegetarian meals prepared fresh with steamed rice, authentic sambar/rasam and cool curd.',
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM • Dinner: 7:30 PM - 9:30 PM',
    sort_order: 1,
    admin_flagged: 0
  },
  {
    id: 'tuesday',
    vendor_id: 'vendor_college_mess',
    day_of_week: 'Tuesday',
    title: 'Tuesday Special Menu',
    items: JSON.stringify([
      'Pappu Anapakaya',
      'Egg Curry',
      'Palak Makhani Curry',
      'Roti Pachadi',
      'Majjiga Chaaru',
      'Rice'
    ]),
    image: '/images/food/rce_mess_cover.webp',
    notes: 'Nutritious combination of Palak Makhani, Egg Curry and comforting Majjiga Chaaru.',
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM • Dinner: 7:30 PM - 9:30 PM',
    sort_order: 2,
    admin_flagged: 0
  },
  {
    id: 'wednesday',
    vendor_id: 'vendor_college_mess',
    day_of_week: 'Wednesday',
    title: 'Wednesday Non-Veg & Veg Feast',
    items: JSON.stringify([
      'Chicken Curry',
      'Rasam',
      'Majjiga',
      'Chutney',
      'Rice'
    ]),
    image: '/images/food/rce_mess_cover.webp',
    notes: 'Midweek special featuring authentic spicy Andhra Chicken Curry with piping hot rice and refreshing buttermilk (Majjiga).',
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM • Dinner: 7:30 PM - 9:30 PM',
    sort_order: 3,
    admin_flagged: 0
  },
  {
    id: 'thursday',
    vendor_id: 'vendor_college_mess',
    day_of_week: 'Thursday',
    title: 'Thursday Special Menu',
    items: JSON.stringify([
      'Akkura Pappu',
      'Sambhar',
      'Potato Fry',
      'Roti Pachadi',
      'Curd Rice'
    ]),
    image: '/images/food/rce_mess_cover.webp',
    notes: 'Crispy seasoned Potato Fry paired with wholesome Akkura Pappu and aromatic Sambhar.',
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM • Dinner: 7:30 PM - 9:30 PM',
    sort_order: 4,
    admin_flagged: 0
  },
  {
    id: 'friday',
    vendor_id: 'vendor_college_mess',
    day_of_week: 'Friday',
    title: 'Friday Traditional Thali',
    items: JSON.stringify([
      'Pappu Tamata',
      'Gutti Vankaya',
      'Rasam',
      'Roti Pachadi',
      'Curd Rice'
    ]),
    image: '/images/food/rce_mess_cover.webp',
    notes: 'Royal Gutti Vankaya (stuffed brinjal curry) served with Pappu Tamata, Rasam and cool Curd Rice.',
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM • Dinner: 7:30 PM - 9:30 PM',
    sort_order: 5,
    admin_flagged: 0
  },
  {
    id: 'saturday',
    vendor_id: 'vendor_college_mess',
    day_of_week: 'Saturday',
    title: 'Saturday Classic Andhra Meals',
    items: JSON.stringify([
      'Mudha Pappu',
      'Avakaya',
      'Appadam',
      'Ghee',
      'Chama Dumpalu Pulusu',
      'Curd Rice'
    ]),
    image: '/images/food/rce_mess_cover.webp',
    notes: 'The quintessential Telugu classic: hot rice, Mudha Pappu, golden pure Ghee, spicy Avakaya pickle, crispy Appadam and Chama Dumpalu Pulusu.',
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM • Dinner: 7:30 PM - 9:30 PM',
    sort_order: 6,
    admin_flagged: 0
  },
  {
    id: 'sunday',
    vendor_id: 'vendor_college_mess',
    day_of_week: 'Sunday',
    title: 'Sunday Weekend Special',
    items: JSON.stringify([
      'Veg Biryani',
      'Paneer Curry',
      'Raita'
    ]),
    image: '/images/food/rce_mess_cover.webp',
    notes: 'Sunday weekend treat with fragrant Veg Biryani, rich Paneer Curry and cool onion-cucumber Raita. (Chicken Curry subject to admin/hostel confirmation).',
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM • Dinner: 7:30 PM - 9:30 PM',
    sort_order: 7,
    admin_flagged: 1 // Flagged for admin confirmation regarding Chicken Curry
  },
  {
    id: 'monthly_special',
    vendor_id: 'vendor_college_mess',
    day_of_week: 'Monthly Special',
    title: "Every Month's Last Sunday Special Feast",
    items: JSON.stringify([
      'Dum Biryani',
      'Katta',
      'Raita'
    ]),
    image: '/images/food/chicken_dum_biryani.jpg',
    notes: "Special Grand Feast served exclusively on the last Sunday of each calendar month. Authentic Dum Biryani served with traditional sour-spicy Katta (gravy) and creamy Raita.",
    meal_timings: 'Lunch Special: 12:30 PM - 3:00 PM',
    sort_order: 8,
    admin_flagged: 0
  }
];

async function main() {
  console.log('🚀 Starting BLINTZY Food: CHOPSTICKS & RCE MESS Migration...');
  const now = Date.now();

  // 1. Ensure food_mess_weekly_menu table exists
  console.log('Creating table food_mess_weekly_menu...');
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS food_mess_weekly_menu (
      id TEXT PRIMARY KEY,
      vendor_id TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      title TEXT NOT NULL,
      items TEXT NOT NULL,
      image TEXT,
      notes TEXT,
      meal_timings TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      admin_flagged INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_mess_weekly_vendor ON food_mess_weekly_menu(vendor_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_mess_weekly_order ON food_mess_weekly_menu(sort_order)').run();

  // 2. Update food_vendors: ensure exactly two active counters (CHOPSTICKS and RCE MESS)
  console.log('Updating food_vendors...');
  // Update CHOPSTICKS (vendor_canteen_stall)
  await db.prepare(`
    INSERT INTO food_vendors (id, name, counter_location, contact, status, opening_hours, vendor_type, onboarding_status, created_at, updated_at)
    VALUES ('vendor_canteen_stall', 'CHOPSTICKS', 'Chopsticks Counter (Main Food Court)', '+91 96529 29243', 'active', '10:00 AM - 10:30 PM', 'canteen', 'approved', ?, ?)
    ON CONFLICT(id) DO UPDATE SET 
      name = 'CHOPSTICKS',
      counter_location = 'Chopsticks Counter (Main Food Court)',
      status = 'active',
      onboarding_status = 'approved',
      vendor_type = 'canteen',
      updated_at = ?
  `).bind(now, now, now).run();

  // Update RCE MESS (vendor_college_mess)
  await db.prepare(`
    INSERT INTO food_vendors (id, name, counter_location, contact, status, opening_hours, vendor_type, onboarding_status, created_at, updated_at)
    VALUES ('vendor_college_mess', 'RCE MESS', 'RCE Mess Dining Hall Counter', '+91 96529 29243', 'active', '7:30 AM - 9:30 PM', 'mess', 'approved', ?, ?)
    ON CONFLICT(id) DO UPDATE SET 
      name = 'RCE MESS',
      counter_location = 'RCE Mess Dining Hall Counter',
      status = 'active',
      onboarding_status = 'approved',
      vendor_type = 'mess',
      updated_at = ?
  `).bind(now, now, now).run();

  // Inactivate any other test vendors
  await db.prepare(`
    UPDATE food_vendors 
    SET status = 'inactive', onboarding_status = 'rejected', updated_at = ?
    WHERE id NOT IN ('vendor_canteen_stall', 'vendor_college_mess')
  `).bind(now).run();

  // 3. Deactivate old menu items to preserve historical order snapshots while removing from active catalogue
  console.log('Archiving old menu items...');
  await db.prepare(`
    UPDATE food_menu_items 
    SET is_available = 0, stock = 0, updated_at = ?
    WHERE id NOT LIKE 'chopsticks_%'
  `).bind(now).run();

  // 4. Insert/upsert the 17 CHOPSTICKS products
  console.log('Seeding 17 CHOPSTICKS products...');
  for (const item of CHOPSTICKS_PRODUCTS) {
    await db.prepare(`
      INSERT INTO food_menu_items (
        id, vendor_id, name, description, price, category_id, dietary,
        image, is_available, stock, meal_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        vendor_id = excluded.vendor_id,
        name = excluded.name,
        description = excluded.description,
        price = excluded.price,
        category_id = excluded.category_id,
        dietary = excluded.dietary,
        image = excluded.image,
        is_available = excluded.is_available,
        stock = excluded.stock,
        meal_type = excluded.meal_type,
        updated_at = ?
    `).bind(
      item.id, item.vendor_id, item.name, item.description, item.price,
      item.category_id, item.dietary, item.image, item.is_available, item.stock,
      item.meal_type, now, now, now
    ).run();
  }

  // 5. Insert/upsert RCE MESS weekly menu
  console.log('Seeding RCE MESS weekly menu...');
  for (const day of RCE_MESS_WEEKLY_MENU) {
    await db.prepare(`
      INSERT INTO food_mess_weekly_menu (
        id, vendor_id, day_of_week, title, items, image, notes,
        meal_timings, is_active, admin_flagged, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        vendor_id = excluded.vendor_id,
        day_of_week = excluded.day_of_week,
        title = excluded.title,
        items = excluded.items,
        image = excluded.image,
        notes = excluded.notes,
        meal_timings = excluded.meal_timings,
        is_active = excluded.is_active,
        admin_flagged = excluded.admin_flagged,
        sort_order = excluded.sort_order,
        updated_at = ?
    `).bind(
      day.id, day.vendor_id, day.day_of_week, day.title, day.items,
      day.image, day.notes, day.meal_timings, day.admin_flagged,
      day.sort_order, now, now, now
    ).run();
  }

  // 6. Verify result counts
  const activeVendors = await db.prepare("SELECT id, name, counter_location, status FROM food_vendors WHERE status = 'active'").all();
  console.log('\n=== ACTIVE FOOD COUNTERS ===');
  console.log(activeVendors.results);

  const activeProducts = await db.prepare("SELECT id, name, price, category_id, dietary, is_available FROM food_menu_items WHERE is_available = 1").all();
  console.log(`\n=== ACTIVE CHOPSTICKS PRODUCTS (${activeProducts.results.length}) ===`);
  console.log(activeProducts.results);

  const weeklyMenu = await db.prepare("SELECT id, day_of_week, title, items, admin_flagged FROM food_mess_weekly_menu ORDER BY sort_order ASC").all();
  console.log(`\n=== RCE MESS WEEKLY SCHEDULE (${weeklyMenu.results.length} entries) ===`);
  for (const m of weeklyMenu.results) {
    console.log(`${m.day_of_week}: ${JSON.parse(m.items).join(', ')} (Flagged: ${m.admin_flagged})`);
  }

  console.log('\n✅ Migration completed successfully!');
}

main().catch(console.error);

