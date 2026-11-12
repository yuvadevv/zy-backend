/**
 * BLINTZY Official Food Configuration: RCE MESS & CHOPSTICKS
 * Authoritative catalogue definitions matching college counters.
 */

export const FOOD_VENDORS = {
  CHOPSTICKS: {
    id: 'vendor_canteen_stall',
    name: 'CHOPSTICKS',
    stall_name: 'CHOPSTICKS',
    counter_location: 'Chopsticks Counter (Main Food Court)',
    counterLocation: 'Chopsticks Counter (Main Food Court)',
    description: 'Fast food & authentic biryanis, fried rice, noodles and sizzling starters.',
    image: '/images/food/chopsticks_cover.webp',
    status: 'active',
    onboarding_status: 'approved',
    phone: '919876543211',
    upi_id: 'chopsticks@icici',
    opens_at: '10:00 AM',
    closes_at: '09:00 PM',
    is_accepting_orders: 1
  },
  RCE_MESS: {
    id: 'vendor_college_mess',
    name: 'RCE MESS',
    stall_name: 'RCE MESS',
    counter_location: 'RCE Mess Dining Hall Counter',
    counterLocation: 'RCE Mess Dining Hall Counter',
    description: 'Official College Mess serving wholesome traditional South Indian meals, daily specials, and Sunday feasts.',
    image: '/images/food/rce_mess_cover.webp',
    status: 'active',
    onboarding_status: 'approved',
    phone: '919876543212',
    upi_id: 'rcemess@sbi',
    opens_at: '07:30 AM',
    closes_at: '09:30 PM',
    is_accepting_orders: 1
  }
};

// Backwards-compatible aliases for any legacy code referencing CANTEEN_STALL / COLLEGE_MESS
FOOD_VENDORS.CANTEEN_STALL = FOOD_VENDORS.CHOPSTICKS;
FOOD_VENDORS.COLLEGE_MESS = FOOD_VENDORS.RCE_MESS;

export const CHOPSTICKS_MENU_ITEMS = [
  // CHICKEN ITEMS
  {
    id: 'chopsticks_chk_01',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Chicken Dum Biryani',
    description: 'Aromatic slow-cooked basmati rice layered with marinated tender chicken, saffron, browned onions and whole spices.',
    price: 150,
    category_id: 'biryani',
    categoryId: 'biryani',
    dietary: 'non-veg',
    image: '/images/food/chicken_dum_biryani.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 60,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_02',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Chicken Fry Biryani',
    description: 'Flavorful spiced biryani rice topped with crispy, spicy Andhra-style chicken fry pieces.',
    price: 150,
    category_id: 'biryani',
    categoryId: 'biryani',
    dietary: 'non-veg',
    image: '/images/food/chicken_fry_biryani.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 50,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_03',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Chicken Fried Rice',
    description: 'Wok-tossed long-grain rice with shredded chicken, scrambled eggs, crisp spring onions and oriental seasoning.',
    price: 100,
    category_id: 'fried-rice',
    categoryId: 'fried-rice',
    dietary: 'non-veg',
    image: '/images/food/chicken_fried_rice.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 50,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_04',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Chicken Noodles',
    description: 'Stir-fried noodles loaded with succulent chicken strips, fresh julienned vegetables and spicy chili-garlic soy sauce.',
    price: 100,
    category_id: 'noodles',
    categoryId: 'noodles',
    dietary: 'non-veg',
    image: '/images/food/chicken_noodles.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 50,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_05',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Chicken Manchurian',
    description: 'Crispy chicken bites tossed in a tangy, spicy Indo-Chinese dark soya and garlic sauce with capsicum.',
    price: 130,
    category_id: 'starters',
    categoryId: 'starters',
    dietary: 'non-veg',
    image: '/images/food/chicken_manchurian.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 40,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_06',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Chicken Mughalai Biryani',
    description: 'Rich royal biryani cooked with egg, cashew paste, rich spices and tender chicken morsels in Mughlai style.',
    price: 180,
    category_id: 'biryani',
    categoryId: 'biryani',
    dietary: 'non-veg',
    image: '/images/food/chicken_mughalai_biryani.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 35,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_07',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Chilli Chicken',
    description: 'Classic wok-seared boneless chicken tossed with fiery green chillies, onions, garlic and dark soy.',
    price: 150,
    category_id: 'starters',
    categoryId: 'starters',
    dietary: 'non-veg',
    image: '/images/food/chilli_chicken.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 45,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_08',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Chicken 65',
    description: 'Famous Andhra hot spiced deep-fried chicken cubes tossed with curry leaves, crushed garlic and curd.',
    price: 160,
    category_id: 'starters',
    categoryId: 'starters',
    dietary: 'non-veg',
    image: '/images/food/chicken_65.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 40,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_chk_09',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Pepper Chicken Dry',
    description: 'Chettinad style dry-roasted chicken with fresh crushed black pepper, caramelized onions and curry aromatics.',
    price: 150,
    category_id: 'starters',
    categoryId: 'starters',
    dietary: 'non-veg',
    image: '/images/food/pepper_chicken_dry.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 40,
    meal_type: 'all_day'
  },

  // VEG ITEMS
  {
    id: 'chopsticks_veg_01',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Paneer Biryani',
    description: 'Fragrant dum biryani with soft grilled cottage cheese cubes, saffron-infused rice and mint masala.',
    price: 160,
    category_id: 'biryani',
    categoryId: 'biryani',
    dietary: 'veg',
    image: '/images/food/paneer_biryani.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 40,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_veg_02',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Mushroom Biryani',
    description: 'Juicy fresh button mushrooms cooked in special aromatic dum spices and fragrant aged basmati rice.',
    price: 160,
    category_id: 'biryani',
    categoryId: 'biryani',
    dietary: 'veg',
    image: '/images/food/mushroom_biryani.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 35,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_veg_03',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Veg Fried Rice',
    description: 'High-flame wok tossed rice with freshly chopped carrots, beans, cabbage, bell peppers and mild seasoning.',
    price: 70,
    category_id: 'fried-rice',
    categoryId: 'fried-rice',
    dietary: 'veg',
    image: '/images/food/veg_fried_rice.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 60,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_veg_04',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Veg Noodles',
    description: 'Street-style wok fried noodles with garden veggies, spring onion, white pepper and light soy.',
    price: 70,
    category_id: 'noodles',
    categoryId: 'noodles',
    dietary: 'veg',
    image: '/images/food/veg_noodles.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 60,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_veg_05',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Veg Manchurian',
    description: 'Golden fried vegetable dumplings simmered in delicious dark garlic-ginger and spring onion sauce.',
    price: 90,
    category_id: 'starters',
    categoryId: 'starters',
    dietary: 'veg',
    image: '/images/food/veg_manchurian.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 50,
    meal_type: 'all_day'
  },

  // EGG ITEMS
  {
    id: 'chopsticks_egg_01',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Egg Fried Rice',
    description: 'Wok tossed aromatic rice cooked with scrambled eggs, diced vegetables, cracked pepper and scallions.',
    price: 90,
    category_id: 'fried-rice',
    categoryId: 'fried-rice',
    dietary: 'non-veg',
    image: '/images/food/egg_fried_rice.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 50,
    meal_type: 'all_day'
  },
  {
    id: 'chopsticks_egg_02',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Egg Noodles',
    description: 'Classic wok noodles with scrambled farm eggs, shredded vegetables, spices and green onion garnish.',
    price: 90,
    category_id: 'noodles',
    categoryId: 'noodles',
    dietary: 'non-veg',
    image: '/images/food/egg_noodles.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 50,
    meal_type: 'all_day'
  },

  // PRAWN ITEMS
  {
    id: 'chopsticks_sea_01',
    vendor_id: 'vendor_canteen_stall',
    vendorId: 'vendor_canteen_stall',
    name: 'Prawn Biryani',
    description: 'Special Coastal Andhra delicacy with spiced marinated fresh prawns layered in fragrant basmati dum rice.',
    price: 180,
    category_id: 'biryani',
    categoryId: 'biryani',
    dietary: 'non-veg',
    image: '/images/food/prawn_biryani.jpg',
    is_available: 1,
    isAvailable: true,
    stock: 30,
    meal_type: 'all_day'
  }
];

export const AUTHORITATIVE_FOOD_MENU = CHOPSTICKS_MENU_ITEMS;

export const RCE_MESS_WEEKLY_MENU = [
  {
    day: 'Monday',
    day_of_week: 1,
    title: 'Monday Traditional Feast',
    items: ['Pappu Tamata', 'Cabbage 65', 'Rasam', 'Roti Pachadi (Chutney)', 'Perugu Annam', 'Rice'],
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM | Dinner: 7:30 PM - 9:30 PM',
    notes: 'Freshly prepared South Indian comforting spread.'
  },
  {
    day: 'Tuesday',
    day_of_week: 2,
    title: 'Tuesday Special Curry Day',
    items: ['Pappu Anapakaya', 'Egg Curry', 'Palak Makhani Curry', 'Roti Pachadi', 'Majjiga Chaaru', 'Rice'],
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM | Dinner: 7:30 PM - 9:30 PM',
    notes: 'Egg Curry & Palak Makhani protein balance.'
  },
  {
    day: 'Wednesday',
    day_of_week: 3,
    title: 'Wednesday Chicken Delight',
    items: ['Chicken Curry', 'Rasam', 'Majjiga', 'Chutney', 'Rice'],
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM | Dinner: 7:30 PM - 9:30 PM',
    notes: 'Midweek special Andhra Chicken Curry meal.'
  },
  {
    day: 'Thursday',
    day_of_week: 4,
    title: 'Thursday Green Leaf & Sambhar',
    items: ['Akkura Pappu', 'Sambhar', 'Potato Fry', 'Roti Pachadi', 'Curd Rice'],
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM | Dinner: 7:30 PM - 9:30 PM',
    notes: 'Nutritious Akkura Pappu with crispy Potato Fry.'
  },
  {
    day: 'Friday',
    day_of_week: 5,
    title: 'Friday Gutti Vankaya Special',
    items: ['Pappu Tamata', 'Gutti Vankaya', 'Rasam', 'Roti Pachadi', 'Curd Rice'],
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM | Dinner: 7:30 PM - 9:30 PM',
    notes: 'Stuffed spicy Gutti Vankaya curry with Rasam.'
  },
  {
    day: 'Saturday',
    day_of_week: 6,
    title: 'Saturday Royal Mudha Pappu & Avakaya',
    items: ['Mudha Pappu', 'Avakaya', 'Appadam', 'Ghee', 'Chama Dumpalu Pulusu', 'Curd Rice'],
    meal_timings: 'Lunch: 12:30 PM - 2:30 PM | Dinner: 7:30 PM - 9:30 PM',
    notes: 'Authentic Telugu Mudha Pappu, Pure Ghee & spicy Avakaya.'
  },
  {
    day: 'Sunday',
    day_of_week: 0,
    title: 'Sunday Weekend Biryani Feast',
    items: ['Veg Biryani', 'Paneer Curry', 'Raita', 'Chicken Curry (Admin Confirmation)'],
    meal_timings: 'Lunch: 12:00 PM - 3:00 PM | Dinner: 7:30 PM - 9:30 PM',
    notes: 'Weekend royal meal. Note: Chicken Curry item flagged for admin confirmation.',
    admin_flagged: 1
  },
  {
    day: 'Monthly Special',
    day_of_week: -1,
    title: "Every Month's Last Sunday Special",
    items: ['Dum Biryani', 'Katta', 'Raita'],
    meal_timings: 'Lunch: 12:00 PM - 3:30 PM',
    notes: 'Grand monthly finale Dum Biryani feast.'
  }
];

export const ITEM_IMAGE_MAP = {
  chopsticks_chk_01: { image: '/images/food/chicken_dum_biryani.jpg' },
  chopsticks_chk_02: { image: '/images/food/chicken_fry_biryani.jpg' },
  chopsticks_chk_03: { image: '/images/food/chicken_fried_rice.jpg' },
  chopsticks_chk_04: { image: '/images/food/chicken_noodles.jpg' },
  chopsticks_chk_05: { image: '/images/food/chicken_manchurian.jpg' },
  chopsticks_chk_06: { image: '/images/food/chicken_mughalai_biryani.jpg' },
  chopsticks_chk_07: { image: '/images/food/chilli_chicken.jpg' },
  chopsticks_chk_08: { image: '/images/food/chicken_65.jpg' },
  chopsticks_chk_09: { image: '/images/food/pepper_chicken_dry.jpg' },
  chopsticks_veg_01: { image: '/images/food/paneer_biryani.jpg' },
  chopsticks_veg_02: { image: '/images/food/mushroom_biryani.jpg' },
  chopsticks_veg_03: { image: '/images/food/veg_fried_rice.jpg' },
  chopsticks_veg_04: { image: '/images/food/veg_noodles.jpg' },
  chopsticks_veg_05: { image: '/images/food/veg_manchurian.jpg' },
  chopsticks_egg_01: { image: '/images/food/egg_fried_rice.jpg' },
  chopsticks_egg_02: { image: '/images/food/egg_noodles.jpg' },
  chopsticks_sea_01: { image: '/images/food/prawn_biryani.jpg' },
  biryani: '/images/food/chicken_dum_biryani.jpg',
  'fried-rice': '/images/food/chicken_fried_rice.jpg',
  noodles: '/images/food/chicken_noodles.jpg',
  starters: '/images/food/chicken_65.jpg'
};

export function getFoodImageFallback(id, categoryId) {
  return ITEM_IMAGE_MAP[id]?.image || ITEM_IMAGE_MAP[categoryId] || '/images/food/chopsticks_cover.webp';
}

export async function seedInitialMenuItems(db) {
  try {
    const existing = await db.prepare('SELECT COUNT(*) as count FROM food_menu_items').first();
    if (existing && existing.count > 0) return;
    const now = Date.now();
    for (const item of CHOPSTICKS_MENU_ITEMS) {
      await db.prepare(`
        INSERT INTO food_menu_items (id, vendor_id, name, description, price, category_id, dietary, image, is_available, stock, meal_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.id,
        item.vendor_id,
        item.name,
        item.description,
        item.price,
        item.category_id,
        item.dietary,
        item.image,
        item.is_available,
        item.stock,
        item.meal_type,
        now,
        now
      ).run();
    }
  } catch (e) {
    console.error('seedInitialMenuItems error:', e);
  }
}

/**
 * Validates and prices items for single-vendor order requests
 */
export async function validateAndPriceFoodOrder(dbOrItems, rawItemsOrVendorId, requestedVendorId) {
  let db = null;
  let rawItems = [];
  let vendorIdParam = null;

  if (dbOrItems && typeof dbOrItems.prepare === 'function') {
    db = dbOrItems;
    rawItems = rawItemsOrVendorId || [];
    vendorIdParam = requestedVendorId || null;
  } else {
    rawItems = dbOrItems || [];
    vendorIdParam = rawItemsOrVendorId || null;
  }

  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    return { success: false, error: 'Order must contain at least one item.' };
  }

  let resolvedVendorId = vendorIdParam || null;
  let validatedItems = [];
  let subtotal = 0;

  for (const item of rawItems) {
    const productId = item.productId || item.id;
    const quantity = parseInt(item.quantity, 10);

    if (!productId) {
      return { success: false, error: 'Each order item must specify a valid productId.' };
    }

    if (isNaN(quantity) || quantity < 1 || quantity > 20) {
      return { success: false, error: `Invalid quantity for item ${productId}. Must be between 1 and 20.` };
    }

    let catalogueProduct = null;

    if (db) {
      try {
        const row = await db.prepare(`
          SELECT m.*, v.name as vendor_name, v.counter_location, v.status as vendor_status
          FROM food_menu_items m
          LEFT JOIN food_vendors v ON m.vendor_id = v.id
          WHERE m.id = ?
        `).bind(productId).first();

        if (row) {
          catalogueProduct = {
            id: row.id,
            name: row.name,
            categoryId: row.category_id,
            dietary: row.dietary,
            price: row.price,
            stock: row.stock,
            isAvailable: row.is_available === 1 && (row.vendor_status === 'active' || !row.vendor_status),
            vendorId: row.vendor_id,
            vendorName: row.vendor_name || 'CHOPSTICKS',
            counterLocation: row.counter_location || 'Chopsticks Counter (Main Food Court)'
          };
        }
      } catch (err) {
        console.error('Error fetching menu item from DB:', err);
      }
    }

    if (!catalogueProduct) {
      catalogueProduct = CHOPSTICKS_MENU_ITEMS.find((p) => p.id === productId);
    }

    if (!catalogueProduct) {
      return { success: false, error: `Food product "${productId}" not found in campus menu.` };
    }

    if (!resolvedVendorId) {
      resolvedVendorId = catalogueProduct.vendorId;
    } else if (resolvedVendorId !== catalogueProduct.vendorId) {
      return {
        success: false,
        error: 'Multi-counter items detected in single order. Please use multi-order checkout.'
      };
    }

    if (!catalogueProduct.isAvailable) {
      return { success: false, error: `Item "${catalogueProduct.name}" is currently sold out.` };
    }

    if (catalogueProduct.stock !== undefined && catalogueProduct.stock < quantity) {
      return { success: false, error: `Item "${catalogueProduct.name}" has only ${catalogueProduct.stock} portions remaining.` };
    }

    const itemTotal = catalogueProduct.price * quantity;
    subtotal += itemTotal;

    validatedItems.push({
      productId: catalogueProduct.id,
      name: catalogueProduct.name,
      categoryId: catalogueProduct.categoryId,
      dietary: catalogueProduct.dietary,
      vendorId: catalogueProduct.vendorId,
      unitPrice: catalogueProduct.price,
      quantity,
      itemTotal,
      cookingNotes: item.cookingNotes || item.specialInstructions ? String(item.cookingNotes || item.specialInstructions).slice(0, 150).trim() : null,
    });
  }

  const vendorObj = Object.values(FOOD_VENDORS).find((v) => v.id === resolvedVendorId) || FOOD_VENDORS.CHOPSTICKS;

  return {
    success: true,
    vendorId: resolvedVendorId,
    vendorName: vendorObj.name,
    counterLocation: vendorObj.counterLocation || vendorObj.counter_location,
    items: validatedItems,
    subtotal,
    deliveryFee: 0,
    platformFee: 0,
    tax: 0,
    grandTotal: subtotal
  };
}

/**
 * Validates and prices items grouped by vendor for unified multi-counter checkout sessions.
 */
export async function validateAndPriceFoodMultiOrder(dbOrItems, rawItemsOrNothing) {
  let db = null;
  let rawItems = [];

  if (dbOrItems && typeof dbOrItems.prepare === 'function') {
    db = dbOrItems;
    rawItems = rawItemsOrNothing || [];
  } else {
    rawItems = dbOrItems || [];
  }

  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    return { success: false, error: 'Order must contain at least one item.' };
  }

  const vendorGroupsMap = new Map();
  let checkoutSubtotal = 0;

  for (const item of rawItems) {
    const productId = item.productId || item.id;
    const quantity = parseInt(item.quantity, 10);

    if (!productId) {
      return { success: false, error: 'Each order item must specify a valid productId.' };
    }

    if (isNaN(quantity) || quantity < 1 || quantity > 20) {
      return { success: false, error: `Invalid quantity for item ${productId}. Must be between 1 and 20.` };
    }

    let catalogueProduct = null;

    if (db) {
      try {
        const row = await db.prepare(`
          SELECT m.*, v.name as vendor_name, v.counter_location, v.status as vendor_status
          FROM food_menu_items m
          LEFT JOIN food_vendors v ON m.vendor_id = v.id
          WHERE m.id = ?
        `).bind(productId).first();

        if (row) {
          catalogueProduct = {
            id: row.id,
            name: row.name,
            categoryId: row.category_id,
            dietary: row.dietary,
            price: row.price,
            stock: row.stock,
            isAvailable: row.is_available === 1 && (row.vendor_status === 'active' || !row.vendor_status),
            vendorId: row.vendor_id,
            vendorName: row.vendor_name || 'CHOPSTICKS',
            counterLocation: row.counter_location || 'Chopsticks Counter (Main Food Court)'
          };
        }
      } catch (err) {
        console.error('Error fetching menu item from DB in multi-order:', err);
      }
    }

    if (!catalogueProduct) {
      catalogueProduct = CHOPSTICKS_MENU_ITEMS.find((p) => p.id === productId);
    }

    if (!catalogueProduct) {
      return { success: false, error: `Food product "${productId}" not found in campus menu.` };
    }

    if (!catalogueProduct.isAvailable) {
      return { success: false, error: `Item "${catalogueProduct.name}" is currently sold out.` };
    }

    if (catalogueProduct.stock !== undefined && catalogueProduct.stock < quantity) {
      return { success: false, error: `Item "${catalogueProduct.name}" has only ${catalogueProduct.stock} portions remaining.` };
    }

    const itemTotal = catalogueProduct.price * quantity;
    checkoutSubtotal += itemTotal;

    const validatedItem = {
      productId: catalogueProduct.id,
      name: catalogueProduct.name,
      categoryId: catalogueProduct.categoryId,
      dietary: catalogueProduct.dietary,
      vendorId: catalogueProduct.vendorId,
      vendorName: catalogueProduct.vendorName,
      counterLocation: catalogueProduct.counterLocation,
      unitPrice: catalogueProduct.price,
      quantity,
      itemTotal,
      cookingNotes: item.cookingNotes || item.specialInstructions ? String(item.cookingNotes || item.specialInstructions).slice(0, 150).trim() : null,
    };

    const vId = catalogueProduct.vendorId;
    if (!vendorGroupsMap.has(vId)) {
      const vendorObj = Object.values(FOOD_VENDORS).find((v) => v.id === vId) || {
        id: vId,
        name: catalogueProduct.vendorName,
        counterLocation: catalogueProduct.counterLocation,
      };

      vendorGroupsMap.set(vId, {
        vendorId: vId,
        vendorName: vendorObj.name,
        counterLocation: vendorObj.counterLocation || vendorObj.counter_location,
        items: [],
        subtotal: 0,
        grandTotal: 0,
      });
    }

    const group = vendorGroupsMap.get(vId);
    group.items.push(validatedItem);
    group.subtotal += itemTotal;
    group.grandTotal += itemTotal;
  }

  const vendorGroups = Array.from(vendorGroupsMap.values());

  return {
    success: true,
    vendorGroups,
    checkoutSubtotal,
    checkoutGrandTotal: checkoutSubtotal,
    deliveryFee: 0,
    platformFee: 0,
    tax: 0,
  };
}
