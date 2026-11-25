# FocusFlow ⏳

> A polished, production-ready Pomodoro study timer with accurate timestamp-based timing, circular SVG progress ring, daily streak tracking, weekly visual analytics, and offline-safe SQLite storage.

[![Live Demo](https://img.shields.io/badge/Demo-Live%20on%20Render-success?style=for-the-badge&logo=render)](https://focusflow-37qe.onrender.com)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-blue?style=for-the-badge&logo=github)](https://github.com/terli-mahesh-cse/focusflow)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

---

### 🌐 Live Application
You can use FocusFlow online directly at:
👉 **[https://focusflow-37qe.onrender.com](https://focusflow-37qe.onrender.com)**

---

## Features

- **High-Precision Timer**: Uses wall-clock timestamps (`Date.now() + remaining*1000`) sampled every 250 ms. Remains drift-free even when tabs run in background.
- **Circular SVG Progress Ring ($r=90$)**: Smooth linear `stroke-dashoffset` drain (~250 ms sweep) with round line caps and pulsing glow when running.
- **Three Modes**: Focus (25m), Short Break (5m), and Long Break (15m) with smooth 400 ms CSS accent cross-fading and sliding pill indicator.
- **Auto Long Break & Cycle Tracking**: Automatic switch to a long break after every 4 focus sessions with an interactive "Session X of 4" dot indicator.
- **Web Audio Chime & Notifications**: Pleasant harmonic synthesized chime (no audio files needed!) and desktop notifications requested only upon the first timer start.
- **Visual Analytics**: Pure SVG/CSS 7-day weekly bar chart with staggered grow animations (no chart libraries needed).
- **Streak & Today Stats**: Tracks consecutive active study days and daily focused minutes.
- **Task Labels**: Optional session goal input ("What are you studying?").
- **Dark Mode**: Automatically respects `prefers-color-scheme` with manual toggle and persistent state.
- **Offline-Safe Mirroring**: Mirrors sessions up to 30 days in `localStorage`. Automatically re-posts and restores history if ephemeral free hosting resets the database.
- **Keyboard Shortcuts**:
  - `Space`: Start / Pause
  - `R`: Reset current timer
  - `1`: Focus Mode
  - `2`: Short Break Mode
  - `3`: Long Break Mode
  - `?`: Toggle Shortcuts Guide
  - `Esc`: Close drawers and dialogs
- **Accessibility**: Semantic HTML, 44px+ touch targets, high contrast (WCAG AA), visible focus rings, and throttled `aria-live` minute announcements.

---

## Project Structure

```text
focusflow/
├── app.py                 # Flask application & API routes
├── schema.sql             # SQLite database schema & defaults
├── requirements.txt       # Python dependencies (Flask, Gunicorn)
├── render.yaml            # Render deployment blueprint
├── .gitignore             # Excluded files and folders
├── README.md              # Project documentation
├── templates/
│   └── index.html         # Main application template
└── static/
    ├── css/
    │   └── style.css      # Design system, animations & dark mode
    └── js/
        ├── api.js         # Fetch helpers & offline storage recovery
        ├── timer.js       # High-precision timer, ring math & Web Audio
        └── ui.js          # Tabs, chart, history, drawer, shortcuts & confetti
```

---

## Local Setup

### Windows (PowerShell)

```powershell
# Navigate to the focusflow directory
cd focusflow

# Create a virtual environment
python -m venv venv

# Activate the virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run the development server
python app.py
```
Open your browser at `http://127.0.0.1:5000`.

### macOS / Linux

```bash
# Navigate to the focusflow directory
cd focusflow

# Create a virtual environment
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the development server
python3 app.py
```
Open your browser at `http://127.0.0.1:5000`.

---

## Production Deployment (Render)

This repository includes a turnkey `render.yaml` blueprint.

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of FocusFlow"
   git remote add origin https://github.com/YOUR_USERNAME/focusflow.git
   git push -u origin main
   ```

2. **Deploy on Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com)
   - Click **New +** -> **Blueprint**
   - Connect your GitHub repository
   - Render automatically reads `render.yaml`, configures Python 3.12, installs dependencies, and runs Gunicorn:
     ```bash
     gunicorn app:app
     ```

### ⚠️ SQLite Ephemeral Storage Warning
> **Note on Free Cloud Tiers**: Free hosting plans (like Render or Fly.io) use ephemeral container disks that reset upon redeployment or when instances spin down.
> **FocusFlow Solution**: FocusFlow automatically mirrors the last 30 days of sessions in `localStorage`. If the server returns empty history due to an instance wipe, the client automatically restores and re-posts previous sessions back to SQLite seamlessly. For permanent server-side persistence, attach a Render Persistent Disk or point `DB_PATH` to a mounted volume.

---

## API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Serves the web interface |
| `GET` | `/api/health` | Healthcheck returning DB status |
| `GET` | `/api/settings` | Retrieves current timer duration settings |
| `POST` | `/api/settings` | Updates timer settings (`focus_min`, `short_break_min`, `long_break_min`) |
| `GET` | `/api/sessions?days=7` | Returns recent sessions, daily grouped history, chart data & streak |
| `POST` | `/api/sessions` | Saves a completed session (`mode`, `minutes`, `task`, `local_date`) |
