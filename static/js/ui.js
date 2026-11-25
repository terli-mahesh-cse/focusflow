/**
 * FocusFlow UI Module
 * Manages DOM interactions, tabs, sliding pill indicator, settings drawer,
 * theme toggling, keyboard shortcuts, SVG weekly bar chart, history list,
 * cycle dots, accessible aria-live announcements, and confetti animation.
 */

import { timer, CIRCUMFERENCE } from "./timer.js";
import { getSettings, saveSettings, getSessions, postSession, getLocalDateString } from "./api.js";

// DOM Elements
const elTime = document.getElementById("time");
const elSrTimer = document.getElementById("sr-timer");
const elRing = document.getElementById("ring-progress");
const elTimerCard = document.getElementById("timer-card");
const elBtnToggle = document.getElementById("btn-toggle");
const elBtnToggleIcon = document.getElementById("btn-toggle-icon");
const elBtnToggleText = document.getElementById("btn-toggle-text");
const elBtnReset = document.getElementById("btn-reset");
const elTaskInput = document.getElementById("task-input");
const elTabs = document.querySelectorAll(".mode-tab");
const elSlidingPill = document.getElementById("tab-pill");
const elCycleDots = document.getElementById("cycle-dots");
const elCycleLabel = document.getElementById("cycle-label");

// Today & Streak stats
const elTodayCount = document.getElementById("stat-today-count");
const elTodayMinutes = document.getElementById("stat-today-minutes");
const elStreakCount = document.getElementById("stat-streak-count");
const elHistoryContainer = document.getElementById("history-container");
const elChartSvg = document.getElementById("weekly-chart-svg");

// Settings Drawer
const elSettingsBtn = document.getElementById("btn-settings");
const elSettingsCloseBtn = document.getElementById("btn-settings-close");
const elSettingsDrawer = document.getElementById("settings-drawer");
const elSettingsBackdrop = document.getElementById("settings-backdrop");
const elSettingsForm = document.getElementById("settings-form");
const elFocusMinInput = document.getElementById("input-focus-min");
const elShortBreakInput = document.getElementById("input-short-break-min");
const elLongBreakInput = document.getElementById("input-long-break-min");
const elSettingsError = document.getElementById("settings-error");

// Shortcuts Dialog
const elBtnHelp = document.getElementById("btn-shortcuts-help");
const elShortcutsDialog = document.getElementById("shortcuts-dialog");
const elShortcutsClose = document.getElementById("btn-shortcuts-close");

// Theme Toggle
const elThemeToggleBtn = document.getElementById("btn-theme-toggle");

// Canvas Confetti
const elConfettiCanvas = document.getElementById("confetti-canvas");

// State tracking for aria-live throttling
let lastAnnouncedMinute = -1;
let currentSettings = {
  focus_min: 25,
  short_break_min: 5,
  long_break_min: 15
};

/**
 * Initialize UI
 */
export async function initUI() {
  // 1. Theme initialization
  initTheme();

  // 2. Setup Ring SVG
  if (elRing) {
    elRing.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
    elRing.style.strokeDashoffset = "0";
  }

  // 3. Connect Timer events & Controls immediately (synchronously)
  setupTimerCallbacks();
  setupEventListeners();

  // 4. Setup sliding pill
  updateSlidingPill();
  window.addEventListener("resize", () => updateSlidingPill());

  // 5. Render initial cycle indicator
  updateCycleIndicator(timer.cycleCount);

  // 6. Fetch initial settings asynchronously
  try {
    currentSettings = await getSettings();
    if (elFocusMinInput) elFocusMinInput.value = currentSettings.focus_min;
    if (elShortBreakInput) elShortBreakInput.value = currentSettings.short_break_min;
    if (elLongBreakInput) elLongBreakInput.value = currentSettings.long_break_min;
    timer.init(currentSettings);
  } catch (e) {
    console.warn("Failed to load settings:", e);
    timer.init(currentSettings);
  }

  // 7. Fetch and render initial sessions history & chart asynchronously
  await refreshData();
}

/**
 * Theme Management
 */
function initTheme() {
  const savedTheme = localStorage.getItem("focusflow_theme");
  if (savedTheme) {
    applyTheme(savedTheme);
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }

  // Listen for system preference changes if no manual preference is saved
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem("focusflow_theme")) {
      applyTheme(e.matches ? "dark" : "light");
    }
  });

  if (elThemeToggleBtn) {
    elThemeToggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem("focusflow_theme", next);
      applyTheme(next);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isDark = theme === "dark";
  if (elThemeToggleBtn) {
    elThemeToggleBtn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    elThemeToggleBtn.innerHTML = isDark
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
}

/**
 * Update sliding pill position over active mode tab
 */
function updateSlidingPill() {
  const activeTab = document.querySelector(".mode-tab.active");
  if (!activeTab || !elSlidingPill) return;

  const left = activeTab.offsetLeft;
  const width = activeTab.offsetWidth;
  elSlidingPill.style.transform = `translateX(${left}px)`;
  elSlidingPill.style.width = `${width}px`;
}

/**
 * Setup Timer Callbacks
 */
function setupTimerCallbacks() {
  timer.onTick = ({ remainingSeconds, totalSeconds, offset, formatted, minutes, seconds }) => {
    // 1. Update large MM:SS digits
    if (elTime) {
      elTime.textContent = formatted;
    }

    // 2. Update ring stroke-dashoffset
    if (elRing) {
      elRing.style.strokeDashoffset = `${offset}`;
    }

    // 3. Update document title
    document.title = `${formatted} - FocusFlow`;

    // 4. Update aria-live polite announcement ONLY on minute changes
    if (elSrTimer && minutes !== lastAnnouncedMinute) {
      lastAnnouncedMinute = minutes;
      if (minutes > 0) {
        elSrTimer.textContent = `${minutes} minute${minutes === 1 ? "" : "s"} remaining`;
      } else if (seconds <= 30 && seconds > 0) {
        elSrTimer.textContent = `${seconds} seconds remaining`;
      }
    }
  };

  timer.onStateChange = (state) => {
    updateButtonState(state);

    if (state === "running") {
      elTimerCard?.classList.add("running");
      elRing?.classList.add("running");
      elRing?.classList.remove("completed");
    } else {
      elTimerCard?.classList.remove("running");
      elRing?.classList.remove("running");
    }
  };

  timer.onModeChange = (mode) => {
    document.documentElement.setAttribute("data-mode", mode);
    elTabs.forEach((tab) => {
      const isTarget = tab.dataset.mode === mode;
      tab.classList.toggle("active", isTarget);
      tab.setAttribute("aria-selected", isTarget ? "true" : "false");
    });
    updateSlidingPill();
    elRing?.classList.remove("completed");
    lastAnnouncedMinute = -1;
  };

  timer.onCycleChange = (count) => {
    updateCycleIndicator(count);
  };

  timer.onComplete = async ({ mode, minutes }) => {
    // 1. Turn ring Leaf green
    elRing?.classList.add("completed");
    elRing?.classList.remove("running");

    // 2. Swap digits to "Session done!"
    if (elTime) {
      elTime.textContent = "Session done!";
    }
    if (elSrTimer) {
      elSrTimer.textContent = "Session complete!";
    }

    // 3. Subtle confetti burst
    triggerConfetti();

    // 4. If mode is focus, save to SQLite via API
    if (mode === "focus") {
      const taskText = elTaskInput ? elTaskInput.value.trim() : "";
      try {
        await postSession({
          mode: "focus",
          minutes,
          task: taskText || null,
          local_date: getLocalDateString()
        });

        // Optionally clear task input on completion
        // Keep it or allow user to keep same task; keeping it is convenient for next session
        await refreshData();
      } catch (err) {
        console.error("Failed to save session:", err);
      }
    }
  };
}

/**
 * Update Start/Pause button appearance
 */
function updateButtonState(state) {
  if (!elBtnToggle) return;

  if (state === "running") {
    elBtnToggle.setAttribute("aria-label", "Pause timer");
    elBtnToggle.classList.add("active-running");
    if (elBtnToggleText) elBtnToggleText.textContent = "Pause";
    if (elBtnToggleIcon) {
      elBtnToggleIcon.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="4" width="4" height="16" rx="1"/>
          <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      `;
    }
  } else {
    elBtnToggle.setAttribute("aria-label", state === "paused" ? "Resume timer" : "Start timer");
    elBtnToggle.classList.remove("active-running");
    if (elBtnToggleText) elBtnToggleText.textContent = state === "paused" ? "Resume" : "Start";
    if (elBtnToggleIcon) {
      elBtnToggleIcon.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      `;
    }
  }
}

/**
 * 4-Dot Cycle Indicator
 */
function updateCycleIndicator(count) {
  if (elCycleLabel) {
    elCycleLabel.textContent = `Session ${count} of 4`;
  }
  if (!elCycleDots) return;

  elCycleDots.innerHTML = "";
  for (let i = 1; i <= 4; i++) {
    const dot = document.createElement("span");
    dot.className = "cycle-dot";
    if (i < count) {
      dot.classList.add("completed");
    } else if (i === count) {
      dot.classList.add("active");
    }
    elCycleDots.appendChild(dot);
  }
}

/**
 * Connect DOM Event Listeners
 */
function setupEventListeners() {
  // Start / Pause
  elBtnToggle?.addEventListener("click", () => {
    if (timer.state === "running") {
      timer.pause();
    } else {
      timer.start();
    }
  });

  // Reset
  elBtnReset?.addEventListener("click", () => {
    timer.reset();
  });

  // Mode Tabs
  elTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;
      if (mode && mode !== timer.currentMode) {
        timer.setMode(mode, false);
      }
    });
  });

  // Settings Drawer Open / Close
  elSettingsBtn?.addEventListener("click", openSettingsDrawer);
  elSettingsCloseBtn?.addEventListener("click", closeSettingsDrawer);
  elSettingsBackdrop?.addEventListener("click", closeSettingsDrawer);

  // Settings Form Submit
  elSettingsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (elSettingsError) elSettingsError.textContent = "";

    const focusVal = parseInt(elFocusMinInput.value, 10);
    const shortVal = parseInt(elShortBreakInput.value, 10);
    const longVal = parseInt(elLongBreakInput.value, 10);

    const validate = (val, name) => {
      if (isNaN(val) || val < 1 || val > 180) {
        return `${name} must be a number between 1 and 180.`;
      }
      return null;
    };

    const err = validate(focusVal, "Focus duration") ||
                validate(shortVal, "Short Break") ||
                validate(longVal, "Long Break");

    if (err) {
      if (elSettingsError) elSettingsError.textContent = err;
      return;
    }

    try {
      const payload = {
        focus_min: focusVal,
        short_break_min: shortVal,
        long_break_min: longVal
      };
      await saveSettings(payload);
      currentSettings = payload;
      timer.updateSettings(payload);
      closeSettingsDrawer();
    } catch (saveErr) {
      if (elSettingsError) elSettingsError.textContent = saveErr.message || "Failed to save settings.";
    }
  });

  // Shortcuts Dialog
  elBtnHelp?.addEventListener("click", () => {
    elShortcutsDialog?.showModal();
  });
  elShortcutsClose?.addEventListener("click", () => {
    elShortcutsDialog?.close();
  });
  elShortcutsDialog?.addEventListener("click", (e) => {
    if (e.target === elShortcutsDialog) {
      elShortcutsDialog.close();
    }
  });

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    // Ignore shortcut when active in text inputs or dialog is open
    const target = e.target;
    const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");

    if (e.key === "Escape") {
      if (elSettingsDrawer?.classList.contains("open")) {
        closeSettingsDrawer();
        return;
      }
      if (elShortcutsDialog?.open) {
        elShortcutsDialog.close();
        return;
      }
    }

    if (isInput) return;

    if (e.code === "Space") {
      e.preventDefault();
      if (timer.state === "running") {
        timer.pause();
      } else {
        timer.start();
      }
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      timer.reset();
    } else if (e.key === "1") {
      e.preventDefault();
      timer.setMode("focus");
    } else if (e.key === "2") {
      e.preventDefault();
      timer.setMode("shortBreak");
    } else if (e.key === "3") {
      e.preventDefault();
      timer.setMode("longBreak");
    } else if (e.key === "?" && !e.shiftKey) {
      e.preventDefault();
      if (elShortcutsDialog?.open) {
        elShortcutsDialog.close();
      } else {
        elShortcutsDialog?.showModal();
      }
    }
  });
}

function openSettingsDrawer() {
  if (!elSettingsDrawer || !elSettingsBackdrop) return;
  elSettingsDrawer.classList.add("open");
  elSettingsBackdrop.classList.add("open");
  elSettingsDrawer.setAttribute("aria-hidden", "false");
  elFocusMinInput?.focus();
}

function closeSettingsDrawer() {
  if (!elSettingsDrawer || !elSettingsBackdrop) return;
  elSettingsDrawer.classList.remove("open");
  elSettingsBackdrop.classList.remove("open");
  elSettingsDrawer.setAttribute("aria-hidden", "true");
  elSettingsBtn?.focus();
}

/**
 * Fetch and Refresh UI Data (Today, Streak, Chart, History)
 */
export async function refreshData() {
  try {
    const data = await getSessions(7);
    renderStats(data);
    renderWeeklyChart(data.days || []);
    renderHistory(data.history || []);
  } catch (err) {
    console.warn("Could not refresh data:", err);
  }
}

/**
 * Render Today's summary and streak
 */
function renderStats(data) {
  const today = data.today || { n: 0, minutes: 0 };
  const streak = data.streak || 0;

  if (elTodayCount) elTodayCount.textContent = today.n || 0;
  if (elTodayMinutes) elTodayMinutes.textContent = `${today.minutes || 0}m`;
  if (elStreakCount) elStreakCount.textContent = streak;
}

/**
 * Pure SVG Weekly Bar Chart with Staggered Animation
 */
function renderWeeklyChart(days) {
  if (!elChartSvg) return;

  const width = 380;
  const height = 150;
  const barWidth = 28;
  const paddingBottom = 26;
  const paddingTop = 24;
  const chartHeight = height - paddingBottom - paddingTop;

  const maxMinutes = Math.max(...days.map((d) => d.minutes || 0), 60); // minimum scale 60 mins

  elChartSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  elChartSvg.innerHTML = "";

  const step = width / (days.length || 7);

  // Background horizontal grid line at max
  const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  gridLine.setAttribute("x1", "0");
  gridLine.setAttribute("y1", paddingTop);
  gridLine.setAttribute("x2", width);
  gridLine.setAttribute("y2", paddingTop);
  gridLine.setAttribute("stroke", "var(--border-color)");
  gridLine.setAttribute("stroke-dasharray", "4 4");
  gridLine.setAttribute("stroke-width", "1");
  elChartSvg.appendChild(gridLine);

  days.forEach((dayData, idx) => {
    const x = idx * step + (step - barWidth) / 2;
    const minutes = dayData.minutes || 0;
    const barH = maxMinutes > 0 ? (minutes / maxMinutes) * chartHeight : 0;
    const y = height - paddingBottom - barH;

    // Background track bar (pill shape)
    const bgBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgBar.setAttribute("x", x);
    bgBar.setAttribute("y", paddingTop);
    bgBar.setAttribute("width", barWidth);
    bgBar.setAttribute("height", chartHeight);
    bgBar.setAttribute("rx", "6");
    bgBar.setAttribute("fill", "var(--track-color)");
    bgBar.setAttribute("opacity", "0.4");
    elChartSvg.appendChild(bgBar);

    // Active value bar with staggered grow-up animation
    if (minutes > 0) {
      const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bar.setAttribute("class", "chart-bar");
      bar.setAttribute("x", x);
      bar.setAttribute("y", y);
      bar.setAttribute("width", barWidth);
      bar.setAttribute("height", Math.max(barH, 4));
      bar.setAttribute("rx", "6");
      bar.setAttribute("fill", dayData.is_today ? "var(--color-ember)" : "var(--color-ember-muted)");
      bar.style.transformOrigin = `bottom`;
      bar.style.animation = `growUp 0.5s ease-out ${idx * 0.08}s both`;

      // Value label on hover / top
      const valText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      valText.setAttribute("x", x + barWidth / 2);
      valText.setAttribute("y", y - 6);
      valText.setAttribute("text-anchor", "middle");
      valText.setAttribute("class", "chart-value-label");
      valText.textContent = `${minutes}m`;
      elChartSvg.appendChild(valText);

      elChartSvg.appendChild(bar);
    }

    // Weekday label
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x + barWidth / 2);
    label.setAttribute("y", height - 6);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", `chart-day-label ${dayData.is_today ? "is-today" : ""}`);
    label.textContent = dayData.weekday || "";
    elChartSvg.appendChild(label);
  });
}

/**
 * Render 7-day History List grouped by day
 */
function renderHistory(historyGroups) {
  if (!elHistoryContainer) return;

  if (!historyGroups || historyGroups.length === 0) {
    elHistoryContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <p class="empty-state-text">No sessions yet - start your first one!</p>
      </div>
    `;
    return;
  }

  const todayStr = getLocalDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  elHistoryContainer.innerHTML = "";

  historyGroups.forEach((group, gIdx) => {
    const groupCard = document.createElement("div");
    groupCard.className = "history-group";
    groupCard.style.animation = `fadeUp 0.4s ease-out ${gIdx * 0.08}s both`;

    let dayTitle = group.date;
    if (group.date === todayStr) {
      dayTitle = "Today";
    } else if (group.date === yesterdayStr) {
      dayTitle = "Yesterday";
    } else {
      try {
        const parts = group.date.split("-");
        const dObj = new Date(parts[0], parts[1] - 1, parts[2]);
        dayTitle = dObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      } catch {
        dayTitle = group.date;
      }
    }

    const header = document.createElement("div");
    header.className = "history-group-header";
    header.innerHTML = `
      <span class="history-group-title">${dayTitle}</span>
      <span class="history-group-badge">${group.n} session${group.n === 1 ? "" : "s"} &bull; ${group.minutes}m</span>
    `;
    groupCard.appendChild(header);

    const list = document.createElement("ul");
    list.className = "history-list";

    (group.sessions || []).forEach((item) => {
      const li = document.createElement("li");
      li.className = "history-item";

      let timeStr = "";
      if (item.finished_at) {
        try {
          const t = new Date(item.finished_at);
          timeStr = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
          timeStr = "";
        }
      }

      li.innerHTML = `
        <div class="history-item-left">
          <span class="history-item-mode-badge">${item.mode === "focus" ? "Focus" : "Break"}</span>
          <span class="history-item-task">${item.task ? escapeHtml(item.task) : "Focus Session"}</span>
        </div>
        <div class="history-item-right">
          <span class="history-item-duration">${item.minutes}m</span>
          <span class="history-item-time">${timeStr}</span>
        </div>
      `;
      list.appendChild(li);
    });

    groupCard.appendChild(list);
    elHistoryContainer.appendChild(groupCard);
  });
}

/**
 * HTML escaper helper
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Lightweight Canvas Confetti Burst (< 1 second)
 */
function triggerConfetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  if (!elConfettiCanvas) return;

  const canvas = elConfettiCanvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = "block";

  const colors = ["#e4572e", "#22c55e", "#fde1d8", "#f59e0b", "#3b82f6", "#ec4899"];
  const particles = [];
  const count = 45;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height * 0.4,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.8) * 9,
      size: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10
    });
  }

  const startTime = performance.now();
  const duration = 900; // < 1s

  function frame(now) {
    const elapsed = now - startTime;
    if (elapsed > duration) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = "none";
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const progress = elapsed / duration;
    const fade = 1 - progress;

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25; // gravity
      p.rotation += p.vRot;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// Start everything when DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initUI);
} else {
  initUI();
}
