/**
 * FocusFlow Timer Module
 * High-precision countdown timer based on wall-clock timestamps (Date.now()),
 * SVG circular progress ring, Web Audio chime, and Web Notifications.
 */

import { postSession } from "./api.js";

export const R_RADIUS = 90;
export const CIRCUMFERENCE = 2 * Math.PI * R_RADIUS; // ~565.486677646

class FocusFlowTimer {
  constructor() {
    // Mode durations in minutes
    this.durations = {
      focus: 25,
      shortBreak: 5,
      longBreak: 15
    };

    this.currentMode = "focus"; // 'focus' | 'shortBreak' | 'longBreak'
    this.state = "idle"; // 'idle' | 'running' | 'paused' | 'completed'

    this.totalSeconds = this.durations.focus * 60;
    this.remainingSeconds = this.totalSeconds;
    this.endTime = null;
    this.intervalId = null;

    // 4-session focus cycle tracking
    this.cycleCount = 1; // 1 to 4
    this.hasRequestedNotification = false;

    // Web Audio context
    this.audioCtx = null;

    // Event callbacks
    this.onTick = null;
    this.onStateChange = null;
    this.onModeChange = null;
    this.onComplete = null;
    this.onCycleChange = null;
  }

  init(settings = {}) {
    if (settings.focus_min) this.durations.focus = Number(settings.focus_min);
    if (settings.short_break_min) this.durations.shortBreak = Number(settings.short_break_min);
    if (settings.long_break_min) this.durations.longBreak = Number(settings.long_break_min);

    this.setMode(this.currentMode, false);
  }

  updateSettings(settings) {
    if (settings.focus_min) this.durations.focus = Number(settings.focus_min);
    if (settings.short_break_min) this.durations.shortBreak = Number(settings.short_break_min);
    if (settings.long_break_min) this.durations.longBreak = Number(settings.long_break_min);

    // If timer is idle/paused, update the current mode's duration
    if (this.state === "idle") {
      this.totalSeconds = this.durations[this.currentMode] * 60;
      this.remainingSeconds = this.totalSeconds;
      this.notifyTick();
    }
  }

  setMode(mode, autoStart = false) {
    this.pause();
    this.currentMode = mode;
    this.state = "idle";
    this.totalSeconds = (this.durations[mode] || 25) * 60;
    this.remainingSeconds = this.totalSeconds;
    this.endTime = null;

    if (this.onModeChange) this.onModeChange(mode);
    if (this.onStateChange) this.onStateChange(this.state);
    this.notifyTick();

    if (autoStart) {
      this.start();
    }
  }

  start() {
    if (this.state === "running") return;

    // Request notification permission only on first Start press
    this.requestNotificationPermission();

    // Initialize or unlock Web Audio on user gesture
    this.initAudio();

    this.state = "running";
    this.endTime = Date.now() + this.remainingSeconds * 1000;

    if (this.onStateChange) this.onStateChange(this.state);

    this.intervalId = setInterval(() => {
      this.tick();
    }, 250);

    this.notifyTick();
  }

  pause() {
    if (this.state !== "running") return;

    clearInterval(this.intervalId);
    this.intervalId = null;

    // Recalculate remaining seconds precisely before pausing
    if (this.endTime) {
      this.remainingSeconds = Math.max(0, Math.round((this.endTime - Date.now()) / 1000));
    }

    this.state = "paused";
    if (this.onStateChange) this.onStateChange(this.state);
    this.notifyTick();
  }

  reset() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.state = "idle";
    this.totalSeconds = (this.durations[this.currentMode] || 25) * 60;
    this.remainingSeconds = this.totalSeconds;
    this.endTime = null;

    if (this.onStateChange) this.onStateChange(this.state);
    this.notifyTick();
  }

  tick() {
    if (!this.endTime) return;

    const diffMs = this.endTime - Date.now();
    this.remainingSeconds = Math.max(0, Math.round(diffMs / 1000));

    this.notifyTick();

    if (this.remainingSeconds <= 0) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.state = "completed";
      this.handleCompletion();
    }
  }

  notifyTick() {
    const fraction = this.totalSeconds > 0 ? this.remainingSeconds / this.totalSeconds : 0;
    // Ring progress offset: 0 when full (start), CIRCUMFERENCE when empty (00:00)
    const offset = CIRCUMFERENCE * (1 - fraction);

    const minutes = Math.floor(this.remainingSeconds / 60);
    const seconds = this.remainingSeconds % 60;
    const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (this.onTick) {
      this.onTick({
        remainingSeconds: this.remainingSeconds,
        totalSeconds: this.totalSeconds,
        fraction,
        offset,
        formatted,
        minutes,
        seconds
      });
    }
  }

  async handleCompletion() {
    if (this.onStateChange) this.onStateChange("completed");

    // Play pleasant chime
    this.playChime();

    // Show native desktop notification
    this.sendNotification();

    const completedMode = this.currentMode;
    const durationMins = this.durations[completedMode];

    // Trigger visual completion callback (Leaf green, "Session done!", confetti)
    if (this.onComplete) {
      this.onComplete({
        mode: completedMode,
        minutes: durationMins,
        cycleCount: this.cycleCount
      });
    }

    // Auto-advance mode logic
    let nextMode = "focus";
    if (completedMode === "focus") {
      if (this.cycleCount >= 4) {
        nextMode = "longBreak";
        this.cycleCount = 1; // Reset cycle after long break
      } else {
        nextMode = "shortBreak";
        this.cycleCount++;
      }
    } else {
      // Finished a break, next is focus
      nextMode = "focus";
    }

    if (this.onCycleChange) {
      this.onCycleChange(this.cycleCount);
    }

    // Give user 2.5 seconds to see the completed state and confetti, then auto-switch
    setTimeout(() => {
      this.setMode(nextMode, false);
    }, 2500);
  }

  initAudio() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx && AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }
    } catch (e) {
      console.warn("[Timer] Web Audio API initialization failed:", e);
    }
  }

  playChime() {
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      // Gentle harmonic chime notes: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz)
      const notes = [523.25, 659.25, 783.99];

      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        // Soft bell envelope
        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.12 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 1.2);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 1.3);
      });
    } catch (err) {
      console.warn("[Timer] Chime audio error:", err);
    }
  }

  requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (this.hasRequestedNotification) return;
    this.hasRequestedNotification = true;

    if (Notification.permission === "default") {
      try {
        Notification.requestPermission().then((perm) => {
          console.info("[Notification] Permission status:", perm);
        });
      } catch (e) {
        console.warn("[Notification] Error requesting permission:", e);
      }
    }
  }

  sendNotification() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    try {
      const modeNames = {
        focus: "Focus session",
        shortBreak: "Short break",
        longBreak: "Long break"
      };
      const title = `${modeNames[this.currentMode] || "Session"} completed!`;
      const body =
        this.currentMode === "focus"
          ? (this.cycleCount >= 4 ? "Outstanding work! Time for a well-deserved long break." : "Great focus! Take a 5-minute breather.")
          : "Break is over. Ready to focus again?";

      new Notification(title, {
        body,
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%23e4572e'/><path d='M35 50 L45 60 L65 40' stroke='white' stroke-width='8' fill='none'/></svg>"
      });
    } catch (e) {
      console.warn("[Notification] Could not display notification:", e);
    }
  }
}

export const timer = new FocusFlowTimer();
