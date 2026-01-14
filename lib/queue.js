// lib/queue.js - Retry mechanism for failed Discord publishes
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

/**
 * Retry a Discord publish operation with exponential backoff
 * @param {Function} publishFn - Async function to execute
 * @param {string} label - Label for logging (e.g., 'RainsTEAM', 'VIP')
 * @returns {Promise<boolean>} - true if successful, false if all retries failed
 */
export async function retryPublish(publishFn, label = 'Discord') {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await publishFn();
      if (attempt > 1) {
        console.log(`[queue] ${label} publié avec succès (tentative ${attempt}/${MAX_RETRIES})`);
      }
      return true;
    } catch (error) {
      console.error(`[queue] ${label} échec (tentative ${attempt}/${MAX_RETRIES}):`, error.message);

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt; // Exponential backoff
        console.log(`[queue] Retry dans ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[queue] ${label} abandonné après ${MAX_RETRIES} tentatives`);
  return false;
}
