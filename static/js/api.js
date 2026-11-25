/**
 * FocusFlow API & Storage Module
 * Handles server communication, offline persistence in localStorage,
 * and automatic restore if server database is wiped.
 */

const STORAGE_KEY_SESSIONS = "focusflow_sessions_v1";
const STORAGE_KEY_SETTINGS = "focusflow_settings_v1";
const RESTORED_FLAG_KEY = "focusflow_restored_once";

/**
 * Returns user's local date string formatted as YYYY-MM-DD
 */
export function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Safe localStorage wrapper with try/catch
 */
export const storage = {
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      console.warn(`[Storage] Failed to read ${key}:`, e);
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn(`[Storage] Failed to write ${key}:`, e);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[Storage] Failed to remove ${key}:`, e);
    }
  }
};

/**
 * Mirror completed session into localStorage (retains up to 30 days)
 */
export function cacheSessionLocally(session) {
  try {
    const list = storage.get(STORAGE_KEY_SESSIONS, []);
    // Prevent duplicates by comparing finished_at or id
    const exists = list.some(
      (s) => (s.id && session.id && s.id === session.id) ||
             (s.finished_at === session.finished_at && s.minutes === session.minutes)
    );
    if (!exists) {
      list.unshift(session);
    }

    // Prune entries older than 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffStr = getLocalDateString(cutoffDate);

    const pruned = list.filter((s) => (s.local_date || "") >= cutoffStr);
    storage.set(STORAGE_KEY_SESSIONS, pruned);
  } catch (err) {
    console.warn("[Storage] Error caching session locally:", err);
  }
}

/**
 * Fetch settings from API with fallback to localStorage
 */
export async function getSettings() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    storage.set(STORAGE_KEY_SETTINGS, data);
    return data;
  } catch (err) {
    console.warn("[API] Using cached settings due to network error:", err);
    return storage.get(STORAGE_KEY_SETTINGS, {
      focus_min: 25,
      short_break_min: 5,
      long_break_min: 15
    });
  }
}

/**
 * Save settings to API & localStorage
 */
export async function saveSettings(settings) {
  storage.set(STORAGE_KEY_SETTINGS, settings);
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Post completed session to server and mirror locally
 */
export async function postSession(sessionData) {
  const payload = {
    mode: sessionData.mode,
    minutes: sessionData.minutes,
    task: sessionData.task || null,
    local_date: sessionData.local_date || getLocalDateString()
  };

  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to save session (HTTP ${res.status})`);
  }

  const result = await res.json();
  const savedSession = result.session || {
    ...payload,
    id: result.id,
    finished_at: new Date().toISOString()
  };

  cacheSessionLocally(savedSession);
  return savedSession;
}

/**
 * Get sessions & history with automatic DB wipe recovery
 */
export async function getSessions(days = 7) {
  const localDate = getLocalDateString();
  try {
    const res = await fetch(`/api/sessions?days=${days}&local_date=${localDate}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Check if server database was wiped (empty history but localStorage has saved sessions)
    const localSessions = storage.get(STORAGE_KEY_SESSIONS, []);
    const serverEmpty = !data.sessions || data.sessions.length === 0;
    const hasLocal = localSessions.length > 0;
    const restoredAlready = storage.get(RESTORED_FLAG_KEY, false);

    if (serverEmpty && hasLocal && !restoredAlready) {
      console.info("[API] Server database appears clean/wiped. Restoring from localStorage...");
      storage.set(RESTORED_FLAG_KEY, true);

      // Re-post local sessions
      for (const item of localSessions.slice(0, 50)) {
        try {
          await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: item.mode,
              minutes: item.minutes,
              task: item.task,
              local_date: item.local_date
            })
          });
        } catch (postErr) {
          console.warn("[API] Failed to re-post session:", postErr);
        }
      }

      // Re-fetch after restore
      const retryRes = await fetch(`/api/sessions?days=${days}&local_date=${localDate}`);
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        return retryData;
      }
    }

    // Update local cache with server sessions
    if (data.sessions && data.sessions.length > 0) {
      data.sessions.forEach(cacheSessionLocally);
    }

    return data;
  } catch (err) {
    console.warn("[API] Network error fetching sessions, building offline view:", err);
    const localSessions = storage.get(STORAGE_KEY_SESSIONS, []);
    return buildOfflineData(localSessions, days, localDate);
  }
}

/**
 * Builds standard data structure from local storage when offline
 */
function buildOfflineData(sessions, days, todayStr) {
  const refDate = new Date();
  const chartDays = [];
  const dailyMap = {};

  sessions.forEach((s) => {
    if (s.mode === "focus" && s.local_date) {
      if (!dailyMap[s.local_date]) {
        dailyMap[s.local_date] = { n: 0, minutes: 0 };
      }
      dailyMap[s.local_date].n += 1;
      dailyMap[s.local_date].minutes += Number(s.minutes) || 0;
    }
  });

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(refDate);
    d.setDate(refDate.getDate() - i);
    const dStr = getLocalDateString(d);
    const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
    const stat = dailyMap[dStr] || { n: 0, minutes: 0 };
    chartDays.push({
      local_date: dStr,
      day: dStr,
      weekday,
      n: stat.n,
      minutes: stat.minutes,
      is_today: dStr === todayStr
    });
  }

  const todayStat = dailyMap[todayStr] || { n: 0, minutes: 0 };

  // Calculate streak offline
  const activeDates = Object.keys(dailyMap).sort().reverse();
  const activeSet = new Set(activeDates);
  let streak = 0;
  let check = new Date(refDate);

  if (activeSet.has(todayStr)) {
    while (activeSet.has(getLocalDateString(check))) {
      streak++;
      check.setDate(check.getDate() - 1);
    }
  } else {
    check.setDate(check.getDate() - 1);
    while (activeSet.has(getLocalDateString(check))) {
      streak++;
      check.setDate(check.getDate() - 1);
    }
  }

  return {
    days: chartDays,
    history: [
      {
        date: todayStr,
        day: todayStr,
        n: todayStat.n,
        minutes: todayStat.minutes,
        sessions: sessions.filter((s) => s.local_date === todayStr)
      }
    ],
    sessions,
    today: todayStat,
    streak
  };
}

/**
 * Health check endpoint ping
 */
export async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    return res.ok;
  } catch {
    return false;
  }
}
