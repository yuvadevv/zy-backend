// Authoritative Food Catalogue and Server-side Pricing Validation for BLINTZY Food

export const FOOD_VENDORS = {
  CANTEEN_STALL: {
    id: 'vendor_canteen_stall',
    name: 'Campus Canteen Stall',
    counterLocation: 'Counter 1 (Main Food Court)',
    stallNumber: 'Stall #1',
    cuisine: 'Fast Food, Tiffins & Curries',
    isOpen: true,
  },
  COLLEGE_MESS: {
    id: 'vendor_college_mess',
    name: 'College Mess Dining',
    counterLocation: 'Dining Hall Counter (Mess Block)',
    stallNumber: 'Mess Hall',
    cuisine: 'Daily Thalis & Traditional Meals',
    isOpen: true,
  },
};

export const AUTHORITATIVE_FOOD_MENU = [
  // 1. Breakfast (Campus Canteen)
  {
    id: 'food_bf_01',
    name: 'Special Ghee Sambar Idli (2 pcs)',
    price: 35,
    categoryId: 'breakfast',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },
  {
    id: 'food_bf_02',
    name: 'Crispy Masala Dosa',
    price: 50,
    categoryId: 'breakfast',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },
  {
    id: 'food_bf_03',
    name: 'Poori with Potato Masala (2 pcs)',
    price: 45,
    categoryId: 'breakfast',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },

  // 2. Meals (College Mess)
  {
    id: 'food_vm_01',
    name: 'Special South Indian Meals Plate',
    price: 80,
    categoryId: 'meals',
    vendorId: FOOD_VENDORS.COLLEGE_MESS.id,
    vendorName: FOOD_VENDORS.COLLEGE_MESS.name,
    counterLocation: FOOD_VENDORS.COLLEGE_MESS.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },
  {
    id: 'food_vm_02',
    name: 'North Indian Mini Thali',
    price: 95,
    categoryId: 'meals',
    vendorId: FOOD_VENDORS.COLLEGE_MESS.id,
    vendorName: FOOD_VENDORS.COLLEGE_MESS.name,
    counterLocation: FOOD_VENDORS.COLLEGE_MESS.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },

  // 3. Veg Curries (Campus Canteen)
  {
    id: 'food_vc_01',
    name: 'Paneer Butter Masala',
    price: 110,
    categoryId: 'veg-curries',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },
  {
    id: 'food_vc_02',
    name: 'Kadai Mushroom Curry',
    price: 100,
    categoryId: 'veg-curries',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },
  {
    id: 'food_vc_03',
    name: 'Mixed Veg Handi',
    price: 85,
    categoryId: 'veg-curries',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },

  // 4. Chicken Curries (Campus Canteen)
  {
    id: 'food_cc_01',
    name: 'Butter Chicken Masala',
    price: 130,
    categoryId: 'chicken-curries',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'non-veg',
    isAvailable: true,
  },
  {
    id: 'food_cc_02',
    name: 'Andhra Spicy Chicken Curry',
    price: 120,
    categoryId: 'chicken-curries',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'non-veg',
    isAvailable: true,
  },
  {
    id: 'food_cc_03',
    name: 'Chicken Mughlai Gravy',
    price: 135,
    categoryId: 'chicken-curries',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'non-veg',
    isAvailable: true,
  },

  // 5. Fried Rice (Campus Canteen)
  {
    id: 'food_fr_01',
    name: 'Egg Fried Rice',
    price: 75,
    categoryId: 'fried-rice',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'egg',
    isAvailable: true,
  },
  {
    id: 'food_fr_02',
    name: 'Chicken Fried Rice',
    price: 90,
    categoryId: 'fried-rice',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'non-veg',
    isAvailable: true,
  },
  {
    id: 'food_fr_03',
    name: 'Veg Schezwan Fried Rice',
    price: 70,
    categoryId: 'fried-rice',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },

  // 6. Egg Items (Campus Canteen)
  {
    id: 'food_egg_01',
    name: 'Egg Omelette (Double Egg)',
    price: 30,
    categoryId: 'egg-items',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'egg',
    isAvailable: true,
  },
  {
    id: 'food_egg_02',
    name: 'Boiled Egg Bhurji',
    price: 45,
    categoryId: 'egg-items',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'egg',
    isAvailable: true,
  },

  // 7. Noodles (Campus Canteen)
  {
    id: 'food_nd_01',
    name: 'Veg Hakka Noodles',
    price: 70,
    categoryId: 'noodles',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },
  {
    id: 'food_nd_02',
    name: 'Chicken Schezwan Noodles',
    price: 95,
    categoryId: 'noodles',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'non-veg',
    isAvailable: true,
  },

  // 8. Pizza (Campus Canteen)
  {
    id: 'food_pz_01',
    name: 'Margherita Personal Pizza (7-inch)',
    price: 99,
    categoryId: 'pizza',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },
  {
    id: 'food_pz_02',
    name: 'Chicken Barbecue Pizza (7-inch)',
    price: 139,
    categoryId: 'pizza',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'non-veg',
    isAvailable: true,
  },

  // 9. Chicken Rolls (Campus Canteen)
  {
    id: 'food_rl_01',
    name: 'Classic Chicken Kathi Roll',
    price: 70,
    categoryId: 'chicken-rolls',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'non-veg',
    isAvailable: true,
  },
  {
    id: 'food_rl_02',
    name: 'Double Egg Chicken Roll',
    price: 85,
    categoryId: 'chicken-rolls',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'non-veg',
    isAvailable: true,
  },

  // 10. Fast Food & Quick Bites
  {
    id: 'food_ff_01',
    name: 'Crispy Veg Burger',
    price: 55,
    categoryId: 'fast-food',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },
  {
    id: 'food_ff_02',
    name: 'Crispy Chicken Burger',
    price: 75,
    categoryId: 'fast-food',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'non-veg',
    isAvailable: true,
  },

  // 11. Snacks & Beverages
  {
    id: 'food_sn_01',
    name: 'Hot Filter Coffee',
    price: 20,
    categoryId: 'snacks',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },
  {
    id: 'food_sn_02',
    name: 'Ginger Masala Tea',
    price: 15,
    categoryId: 'snacks',
    vendorId: FOOD_VENDORS.CANTEEN_STALL.id,
    vendorName: FOOD_VENDORS.CANTEEN_STALL.name,
    counterLocation: FOOD_VENDORS.CANTEEN_STALL.counterLocation,
    dietary: 'veg',
    isAvailable: true,
  },
];

/**
 * Validates food items against the authoritative catalogue, checks single-vendor isolation,
 * and recalculates exact prices server-side. Never trusts frontend prices or totals.
 * Supports both D1 Database query (async) and static fallback.
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
            vendorName: row.vendor_name || (row.vendor_id === FOOD_VENDORS.COLLEGE_MESS.id ? FOOD_VENDORS.COLLEGE_MESS.name : FOOD_VENDORS.CANTEEN_STALL.name),
            counterLocation: row.counter_location || (row.vendor_id === FOOD_VENDORS.COLLEGE_MESS.id ? FOOD_VENDORS.COLLEGE_MESS.counterLocation : FOOD_VENDORS.CANTEEN_STALL.counterLocation)
          };
        }
      } catch (err) {
        console.error('Error fetching menu item from DB:', err);
      }
    }

    // Fallback to static catalogue if DB lookup didn't find it
    if (!catalogueProduct) {
      catalogueProduct = AUTHORITATIVE_FOOD_MENU.find((p) => p.id === productId);
    }

    if (!catalogueProduct) {
      return { success: false, error: `Food product "${productId}" not found in campus menu.` };
    }

    if (!catalogueProduct.isAvailable) {
      return { success: false, error: `Item "${catalogueProduct.name}" is currently sold out.` };
    }

    // Check available stock if tracked
    if (catalogueProduct.stock !== undefined && catalogueProduct.stock < quantity) {
      return { success: false, error: `Item "${catalogueProduct.name}" has only ${catalogueProduct.stock} portions remaining.` };
    }

    // Single-vendor isolation enforcement
    if (!resolvedVendorId) {
      resolvedVendorId = catalogueProduct.vendorId;
    } else if (resolvedVendorId !== catalogueProduct.vendorId) {
      return {
        success: false,
        error: `Cannot mix items from different campus counters. All items must belong to "${catalogueProduct.vendorName}".`,
      };
    }

    const itemTotal = catalogueProduct.price * quantity;
    subtotal += itemTotal;

    validatedItems.push({
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
    });
  }

  const vendorObj = Object.values(FOOD_VENDORS).find((v) => v.id === resolvedVendorId) || {
    id: resolvedVendorId,
    name: validatedItems[0].vendorName,
    counterLocation: validatedItems[0].counterLocation,
  };

  // Zero delivery charges, zero taxes, zero platform fees mandate:
  // Subtotal equals grand total.
  return {
    success: true,
    vendorId: resolvedVendorId,
    vendorName: vendorObj.name,
    counterLocation: vendorObj.counterLocation,
    items: validatedItems,
    subtotal,
    deliveryFee: 0,
    platformFee: 0,
    tax: 0,
    grandTotal: subtotal,
  };
}

/**
 * Validates and prices items grouped by vendor for unified multi-counter checkout sessions.
 * Allows items from multiple counters in the cart while segregating them into distinct vendor groups.
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
            vendorName: row.vendor_name || (row.vendor_id === FOOD_VENDORS.COLLEGE_MESS.id ? FOOD_VENDORS.COLLEGE_MESS.name : FOOD_VENDORS.CANTEEN_STALL.name),
            counterLocation: row.counter_location || (row.vendor_id === FOOD_VENDORS.COLLEGE_MESS.id ? FOOD_VENDORS.COLLEGE_MESS.counterLocation : FOOD_VENDORS.CANTEEN_STALL.counterLocation)
          };
        }
      } catch (err) {
        console.error('Error fetching menu item from DB in multi-order:', err);
      }
    }

    if (!catalogueProduct) {
      catalogueProduct = AUTHORITATIVE_FOOD_MENU.find((p) => p.id === productId);
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
        counterLocation: vendorObj.counterLocation,
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

export const ITEM_IMAGE_MAP = {
  food_bf_01: {
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
    description: 'Steamed rice idlis dipped in hot aromatic sambar with coconut chutney and podi.'
  },
  food_bf_02: {
    image: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80',
    description: 'Golden roasted fermented crepe rolled with spiced potato bhaji and fresh chutneys.'
  },
  food_bf_03: {
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    description: 'Hot puffed whole wheat pooris served with mild spiced onion-potato sagu.'
  },
  food_vm_01: {
    image: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=600&q=80',
    description: 'Steamed rice, sambar, rasam, curd, seasonal veg curry, papad and pickle.'
  },
  food_vm_02: {
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    description: 'Paneer butter masala, dal makhani, 2 phulkas, jeera rice, salad and gulab jamun.'
  },
  food_vc_01: {
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80',
    description: 'Fresh cottage cheese simmered in rich buttery tomato cashew gravy.'
  },
  food_vc_02: {
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    description: 'Button mushrooms tossed with bell peppers and roasted ground spices.'
  },
  food_vc_03: {
    image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80',
    description: 'Assorted seasonal vegetables simmered in creamy handi gravy.'
  },
  food_cc_01: {
    image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80',
    description: 'Tender chicken pieces cooked in a creamy spiced buttery tomato sauce.'
  },
  food_cc_02: {
    image: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80',
    description: 'Traditional fiery Andhra style chicken curry infused with curry leaves.'
  },
  food_cc_03: {
    image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
    description: 'Royal Mughlai chicken preparation with cashew nuts and saffron notes.'
  },
  food_fr_01: {
    image: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=600&q=80',
    description: 'Wok tossed basmati rice with scrambled farm eggs, scallions and soy.'
  },
  food_fr_02: {
    image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80',
    description: 'Fluffy rice wok tossed with shredded spicy chicken, carrots and cabbage.'
  },
  food_fr_03: {
    image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80',
    description: 'Spicy Schezwan chilli garlic fried rice with diced garden vegetables.'
  },
  food_egg_01: {
    image: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=600&q=80',
    description: 'Fluffy double egg masala omelette with onions, green chillies and coriander.'
  },
  food_egg_02: {
    image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
    description: 'Spicy scrambled eggs with roasted tomato, onion tadka and pav spices.'
  },
  food_nd_01: {
    image: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=80',
    description: 'Wok-tossed noodles with shredded bell peppers, cabbage and light soya sauce.'
  },
  food_nd_02: {
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80',
    description: 'Spicy noodles tossed with tender chicken chunks and in-house Schezwan sauce.'
  },
  food_pz_01: {
    image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80',
    description: 'Stone-crust base topped with rich marinara sauce and 100% mozzarella.'
  },
  food_pz_02: {
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
    description: 'Smoky BBQ chicken chunks, diced red onions and mozzarella cheese.'
  },
  food_rl_01: {
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    description: 'Flaky parotta roll stuffed with marinated grilled chicken and mint mayo.'
  },
  food_rl_02: {
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    description: 'Double egg coated layered parotta rolled with juicy spiced chicken pieces.'
  },
  food_ff_01: {
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
    description: 'Golden spiced potato-herb patty with crunchy lettuce and cream mayo in a brioche bun.'
  },
  food_ff_02: {
    image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80',
    description: 'Crispy fried chicken fillet stacked with zesty coleslaw and cheese slice.'
  },
  food_sn_01: {
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
    description: 'Traditional decoction brewed filter coffee served piping hot.'
  },
  food_sn_02: {
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
    description: 'Kadak ginger cardamon milk tea brewed fresh on order.'
  }
};

export function getFoodImageFallback(itemId, categoryId) {
  if (itemId && ITEM_IMAGE_MAP[itemId]?.image) {
    return ITEM_IMAGE_MAP[itemId].image;
  }
  switch (categoryId) {
    case 'breakfast':
      return 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80';
    case 'meals':
    case 'veg-meals':
      return 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=600&q=80';
    case 'chicken-curries':
      return 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80';
    case 'veg-curries':
      return 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80';
    case 'fried-rice':
      return 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80';
    case 'noodles':
      return 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=80';
    case 'egg-items':
      return 'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=600&q=80';
    case 'pizza':
    case 'fast-food':
      return 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80';
    case 'chicken-rolls':
      return 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80';
    case 'snacks':
    case 'snacks-beverages':
      return 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80';
    default:
      return 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80';
  }
}

export async function seedInitialMenuItems(db) {
  try {
    const existing = await db.prepare('SELECT COUNT(*) as count FROM food_menu_items').first();
    const now = Date.now();

    if (existing && existing.count > 0) {
      // Check if any items have empty image or description and update them
      const emptyCheck = await db.prepare("SELECT COUNT(*) as count FROM food_menu_items WHERE image IS NULL OR image = ''").first();
      if (emptyCheck && emptyCheck.count > 0) {
        const updateStmts = [];
        for (const [id, meta] of Object.entries(ITEM_IMAGE_MAP)) {
          updateStmts.push(db.prepare(
            "UPDATE food_menu_items SET image = ?, description = COALESCE(NULLIF(description, ''), ?), updated_at = ? WHERE id = ? AND (image IS NULL OR image = '')"
          ).bind(meta.image, meta.description, now, id));
        }
        if (updateStmts.length > 0) {
          await db.batch(updateStmts);
          console.log(`[FOOD_INIT] Backfilled high-res images and descriptions for existing food items.`);
        }
      }
      return;
    }

    const stmts = [];

    for (const item of AUTHORITATIVE_FOOD_MENU) {
      const isMess = item.vendorId === FOOD_VENDORS.COLLEGE_MESS.id;
      const mealType = isMess ? 'lunch' : (item.categoryId === 'breakfast' ? 'breakfast' : 'all_day');
      const itemMeta = ITEM_IMAGE_MAP[item.id];
      const itemImage = (itemMeta?.image) || item.image || getFoodImageFallback(item.id, item.categoryId);
      const itemDesc = (itemMeta?.description) || item.description || 'Freshly prepared at campus counter.';

      stmts.push(db.prepare(`
        INSERT OR IGNORE INTO food_menu_items (
          id, vendor_id, name, description, price, category_id, dietary,
          image, is_available, stock, meal_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 50, ?, ?, ?)
      `).bind(
        item.id, item.vendorId, item.name, itemDesc, item.price,
        item.categoryId, item.dietary, itemImage, mealType, now, now
      ));
    }

    if (stmts.length > 0) {
      await db.batch(stmts);
      console.log(`[FOOD_INIT] Successfully seeded ${stmts.length} initial food menu items with images into D1.`);
    }
  } catch (err) {
    console.error('Failed to seed food menu items:', err);
  }
}


