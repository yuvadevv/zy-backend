/**
 * Centralized Delivery Schedule Service (Backend)
 * 
 * Manages admin-controlled printing & classroom delivery schedules.
 * Ensures consistent IST (Asia/Kolkata) date and time calculations.
 */

export const DEFAULT_DELIVERY_SCHEDULE = {
  enabled: true,
  dateMode: 'tomorrow', // 'today' | 'tomorrow' | 'next_working_day' | 'custom_date'
  customDate: '', // 'YYYY-MM-DD'
  timeSlot: 'morning', // 'morning' | 'afternoon' | 'evening' | 'custom'
  startTime: '09:00 AM',
  endTime: '12:00 PM',
  deliveryLabel: 'Tomorrow Morning',
  deliveryLocation: 'Directly to Your Classroom',
  deliveryMessage: 'Orders placed now will be delivered directly to your classroom tomorrow morning.',
  classroomDeliveryStatus: 'active' // 'active' | 'paused'
};

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Extracts date components in Asia/Kolkata (IST).
 */
export function getISTDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10), // 1-12
    day: parseInt(map.day, 10),
    weekday: map.weekday,
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    dayPeriod: map.dayPeriod // 'AM' | 'PM'
  };
}

function parseTimeString(timeStr = '09:00 AM') {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  let h = 9;
  let m = 0;
  if (match) {
    h = parseInt(match[1], 10);
    m = parseInt(match[2], 10);
    const ampm = (match[3] || 'AM').toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  }
  return { h, m };
}

/**
 * Computes exact epoch milliseconds in IST for a target date and time.
 */
export function computeEtaMsIST(year, month, day, timeStr = '09:00 AM') {
  const { h, m } = parseTimeString(timeStr);
  // IST is UTC+05:30
  const utcHours = h - 5;
  const utcMinutes = m - 30;
  return Date.UTC(year, month - 1, day, utcHours, utcMinutes, 0, 0);
}

export function formatCustomTime(hhmm = '09:00') {
  if (!hhmm) return '09:00 AM';
  if (/AM|PM/i.test(hhmm)) return hhmm.trim();
  const parts = hhmm.split(':');
  let h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Resolves delivery schedule configuration into student-facing computed values in IST.
 */
export function computeDeliveryDetails(rawConfig = {}, nowInput = new Date()) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput || Date.now());
  const config = { ...DEFAULT_DELIVERY_SCHEDULE, ...rawConfig };
  const istNow = getISTDateParts(now);

  const dateMode = config.date_mode || config.dateMode || 'tomorrow';
  let targetYear = istNow.year;
  let targetMonth = istNow.month;
  let targetDay = istNow.day;
  let dayLabel = 'Tomorrow';

  if (dateMode === 'today') {
    dayLabel = 'Today';
  } else if (dateMode === 'tomorrow') {
    const nextDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const istNext = getISTDateParts(nextDate);
    targetYear = istNext.year;
    targetMonth = istNext.month;
    targetDay = istNext.day;
    dayLabel = 'Tomorrow';
  } else if (dateMode === 'next_working_day') {
    let daysToAdd = 1;
    if (istNow.weekday === 'Friday') daysToAdd = 3;
    else if (istNow.weekday === 'Saturday') daysToAdd = 2;
    else if (istNow.weekday === 'Sunday') daysToAdd = 1;

    const nextDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    const istNext = getISTDateParts(nextDate);
    targetYear = istNext.year;
    targetMonth = istNext.month;
    targetDay = istNext.day;
    dayLabel = (daysToAdd === 1) ? 'Tomorrow' : istNext.weekday;
  } else if (dateMode === 'custom_date') {
    const customDateVal = config.custom_date || config.customDate || '';
    if (customDateVal) {
      const [y, m, d] = customDateVal.split('-').map(Number);
      if (y && m && d) {
        targetYear = y;
        targetMonth = m;
        targetDay = d;

        if (y === istNow.year && m === istNow.month && d === istNow.day) {
          dayLabel = 'Today';
        } else {
          const nextDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          const istNext = getISTDateParts(nextDate);
          if (y === istNext.year && m === istNext.month && d === istNext.day) {
            dayLabel = 'Tomorrow';
          } else {
            const dObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
            dayLabel = dObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
          }
        }
      }
    }
  }

  const formattedDate = `${dayLabel}, ${MONTH_NAMES[targetMonth]} ${targetDay}`;
  const isoDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

  // Time slot determination
  const timeSlot = config.time_mode || config.timeSlot || 'morning';
  let startTime = config.start_time || config.startTime || '09:00 AM';
  let endTime = config.end_time || config.endTime || '12:00 PM';

  if (timeSlot === 'morning') {
    startTime = '09:00 AM';
    endTime = '12:00 PM';
  } else if (timeSlot === 'afternoon') {
    startTime = '01:00 PM';
    endTime = '04:00 PM';
  } else if (timeSlot === 'evening') {
    startTime = '04:00 PM';
    endTime = '06:00 PM';
  } else if (timeSlot === 'custom') {
    if (config.custom_start_time) startTime = formatCustomTime(config.custom_start_time);
    if (config.custom_end_time) endTime = formatCustomTime(config.custom_end_time);
  }

  const timeRange = `${startTime} – ${endTime}`;
  const slotCapitalized = timeSlot.charAt(0).toUpperCase() + timeSlot.slice(1);
  const deliveryLabel = (config.delivery_label || config.deliveryLabel || '').trim() ||
    `${dayLabel} ${slotCapitalized !== 'Custom' ? slotCapitalized : ''}`.trim();

  const deliveryLocation = (config.delivery_location || config.deliveryLocation || '').trim() ||
    'Directly to Your Classroom';

  const defaultMsg = `Orders placed now will be delivered directly to your classroom ${dayLabel.toLowerCase()} ${timeSlot === 'morning' ? 'morning' : slotCapitalized.toLowerCase()}.`.trim();
  const deliveryMessage = (config.delivery_message || config.deliveryMessage || '').trim() || defaultMsg;
  const classroomDeliveryStatus = config.delivery_status || config.classroomDeliveryStatus || 'active';
  const pauseMessage = config.pause_message || config.pauseMessage || 'Classroom delivery is temporarily paused today.';

  const etaMs = computeEtaMsIST(targetYear, targetMonth, targetDay, startTime);

  return {
    isoDate,
    formattedDate,
    targetDay: dayLabel,
    timeSlot,
    startTime,
    endTime,
    timeRange,
    deliveryLabel,
    deliveryLocation,
    deliveryMethod: 'Direct Classroom Delivery',
    deliveryMessage: classroomDeliveryStatus === 'paused' ? pauseMessage : deliveryMessage,
    headline: `Delivered directly to your classroom ${dayLabel.toLowerCase()}.`,
    reassurance: classroomDeliveryStatus === 'paused' ? pauseMessage : deliveryMessage,
    shortReassurance: "No need to visit the print shop — we'll deliver directly to your class.",
    etaMs,
    enabled: config.enabled !== false,
    classroomDeliveryStatus
  };
}

/**
 * Creates an immutable delivery snapshot for an order.
 */
export function createOrderDeliverySnapshot(config = {}, nowInput = new Date(), override = null) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput || Date.now());
  const computed = computeDeliveryDetails(config, now);
  const snapshot = {
    expectedDate: computed.isoDate,
    expectedDateLabel: computed.formattedDate,
    targetDay: computed.targetDay,
    timeSlot: computed.timeSlot,
    startTime: computed.startTime,
    endTime: computed.endTime,
    timeRange: computed.timeRange,
    deliveryLabel: computed.deliveryLabel,
    deliveryMethod: computed.deliveryMethod,
    deliveryLocation: computed.deliveryLocation,
    deliveryMessage: computed.deliveryMessage,
    classroomDeliveryStatus: computed.classroomDeliveryStatus,
    etaMs: computed.etaMs,
    createdAt: Date.now()
  };

  if (override && typeof override === 'object') {
    if (override.expectedDate) snapshot.expectedDate = override.expectedDate;
    if (override.expectedDateLabel) snapshot.expectedDateLabel = override.expectedDateLabel;
    if (override.targetDay) snapshot.targetDay = override.targetDay;
    if (override.timeRange) snapshot.timeRange = override.timeRange;
    if (override.startTime) snapshot.startTime = override.startTime;
    if (override.endTime) snapshot.endTime = override.endTime;
    if (override.deliveryLocation) snapshot.deliveryLocation = override.deliveryLocation;
    if (override.deliveryLabel) snapshot.deliveryLabel = override.deliveryLabel;
    if (override.deliveryMessage) snapshot.deliveryMessage = override.deliveryMessage;
    if (override.etaMs) snapshot.etaMs = override.etaMs;
    snapshot.isOverridden = true;
    snapshot.overriddenAt = Date.now();
  }

  return snapshot;
}

/**
 * Fetches current delivery schedule configuration from platform_settings.
 */
export async function getDeliveryScheduleConfig(db) {
  try {
    const row = await db.prepare("SELECT setting_value FROM platform_settings WHERE setting_key = 'delivery_schedule'").first();
    if (row && row.setting_value) {
      const parsed = JSON.parse(row.setting_value);
      return { ...DEFAULT_DELIVERY_SCHEDULE, ...parsed };
    }
  } catch (err) {
    console.error('Failed to parse delivery_schedule from platform_settings:', err);
  }
  return { ...DEFAULT_DELIVERY_SCHEDULE };
}

/**
 * Updates delivery schedule configuration in platform_settings.
 */
export async function updateDeliveryScheduleConfig(db, updates, adminId = 'admin') {
  const current = await getDeliveryScheduleConfig(db);
  const nextConfig = {
    ...current,
    ...updates,
    updatedAt: Date.now(),
    updatedBy: adminId
  };

  const strValue = JSON.stringify(nextConfig);
  const now = Date.now();

  const stmts = [
    db.prepare(`
      INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by)
      VALUES ('delivery_schedule', ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET 
        setting_value = excluded.setting_value, 
        updated_at = excluded.updated_at, 
        updated_by = excluded.updated_by
    `).bind(strValue, now, adminId),

    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, 'ADMIN', 'UPDATE', 'delivery_schedule', 'delivery_schedule', ?, ?)
    `).bind(adminId, strValue, now)
  ];

  await db.batch(stmts);
  return nextConfig;
}
