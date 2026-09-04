export const DEFAULT_DELIVERY_SETTINGS = {
  shopOpenTime: '09:00',
  dailyCutoffTime: '18:00',
  normalDeliveryTime: '09:15',
  afterCutoffDeliveryTime: '09:10'
};

/**
 * Calculates estimated delivery time based on current time, settings, and holidays.
 * @param {Date} now - Current Date object
 * @param {Object} settings - Delivery settings
 * @param {Array} holidays - Array of holiday objects: { date: 'YYYY-MM-DD', scope: 'all'|'branch'|'year', branch_id, academic_year_id }
 * @param {Object} studentContext - { branch_id, academic_year_id }
 * @returns {Number} - Timestamp in ms
 */
export function calculateEstimatedDelivery(now, settings = null, holidays = [], studentContext = {}) {
  const config = settings || DEFAULT_DELIVERY_SETTINGS;
  
  // Parse times
  const [openH, openM] = config.shopOpenTime.split(':').map(Number);
  const [cutoffH, cutoffM] = config.dailyCutoffTime.split(':').map(Number);
  const [normDelH, normDelM] = config.normalDeliveryTime.split(':').map(Number);
  const [afterDelH, afterDelM] = config.afterCutoffDeliveryTime.split(':').map(Number);
  
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  let targetDate = new Date(now);
  let targetH = normDelH;
  let targetM = normDelM;
  
  // If after cutoff, we schedule for next cycle
  const isAfterCutoff = currentHour > cutoffH || (currentHour === cutoffH && currentMinute >= cutoffM);
  
  if (isAfterCutoff) {
    targetH = afterDelH;
    targetM = afterDelM;
    targetDate.setDate(targetDate.getDate() + 1);
  } else {
    // If before opening, just use normal delivery time today?
    // Business rule: 9am-6pm targets next working day around 9:15am.
    // Wait, requirement says: "Orders placed from 9:00 AM -> 6:00 PM should be targeted for NEXT WORKING DAY around 9:15 AM".
    targetDate.setDate(targetDate.getDate() + 1);
  }
  
  // Helper to check if a date is working day
  const isWorkingDay = (dateObj) => {
    const day = dateObj.getDay();
    if (day === 0) return false; // Sunday
    // Check holidays
    const dateStr = dateObj.toISOString().split('T')[0];
    for (const h of holidays) {
      if (h.date === dateStr) {
        if (h.scope === 'all') return false;
        if (h.scope === 'branch' && h.branch_id === studentContext.branch_id) return false;
        if (h.scope === 'year' && h.academic_year_id === studentContext.academic_year_id) return false;
      }
    }
    return true;
  };
  
  // Find next working day
  while (!isWorkingDay(targetDate)) {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  
  targetDate.setHours(targetH, targetM, 0, 0);
  return targetDate.getTime();
}
