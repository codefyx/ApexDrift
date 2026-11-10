# APEX DRIFT

A vivid, neon-soaked 3D arcade racer for laptop browsers and installable Android PWA.
No build step and no downloaded game art — the cars, textures, scenery and audio
are generated in code, with Three.js and the fonts vendored locally.

- 4 night circuits across a progression map
- 8-car grid with random AI rivals
- Solo practice on every circuit, including locked ones
- Three difficulty levels, with an auto-throttle EASY mode
- Power, speed, skill and nitro upgrades
- Paints, finishes and underglow
- Diamonds, race payouts, level XP, achievements and daily bonuses
- Full race history with lap splits and payout breakdowns
- Keyboard, touch and tilt controls
- Works offline after the first load

---

## Quick start (Windows laptop)

1. Install **Node.js LTS** from <https://nodejs.org> (if it is not already installed).
2. Double-click **`start-game.bat`**.
3. Your browser opens at <http://localhost:5173>.

Or from a terminal:

```powershell
cd C:\Users\A\Desktop\ApexDrift
npm start
```

Then open <http://localhost:5173>.

If PowerShell blocks the `npm` shim, run the zero-dependency server directly:

```powershell
node server.js
```

> The game must be served over HTTP. Opening `index.html` directly with `file://`
> will block ES modules and the PWA service worker.

### Controls

| Action | Keyboard |
| --- | --- |
| Accelerate | `W` / `↑` |
| Brake / reverse | `S` / `↓` |
| Steer | `A` `D` / `←` `→` |
| Drift / handbrake | `Space` |
| Nitro | `Shift` |
| Change camera | `C` |
| Reset to track | `R` |
| Pause | `Esc` / `P` |

On a phone, use the on-screen GAS, BRAKE, DRIFT, NITRO and steering buttons.
Tilt steering can be enabled in **Settings → Tilt steering**. On `EASY`, the car
accelerates automatically, so the arrow keys alone are enough to steer and brake.

### Graphics quality

**Settings → Graphics** offers `AUTO`, `HIGH` and `LOW`. HIGH adds bloom and a
larger shadow budget. AUTO keeps bloom off on mobile and lowers the render
resolution to protect the frame rate. Lower the setting if the game stutters.

### Difficulty

Choose `EASY`, `NORMAL` or `HARD` under **Settings → Difficulty**. The small
`AI` badge on the circuit detail panel shows the current rival level; tap it to
cycle. Difficulty changes both the AI pack and your car's handling.

- `EASY` adds auto-throttle, extra grip, stability and gentler steering, and
  makes the rivals calmer. Use the arrow keys or on-screen controls as normal.
- `NORMAL` is the balanced setup.
- `HARD` makes the pack faster and your car less forgiving. Upgrades matter.

### Assists and fairness

The player always has the most stable car on the grid, and the race is tuned so
that a mistake costs a few seconds, not the whole race:

- **Best control, always** — the player's car gets a permanent grip bonus and a
  stability floor above every rival's, on every difficulty.
- **Crash avoidance** — when the car is predicted to run wide, steering help
  pulls it back toward the racing line and extra grip stops the slide. A soft
  barrier a little inside the wall nudges the player back onto the track instead
  of letting them crash.
- **Catch-up assist** — when you are more than ~35 m behind the leader, your car
  gains up to +18% top speed, +30% acceleration, +16% grip and faster nitro
  regen. The help scales with the gap and caps out at ~380 m.
- **Slipstream** — sitting within 34 m behind a rival, lined up with it, gives a
  tow of up to +10% top speed and +20% acceleration, so passes are always on.
- **Rivals make room** — a rival just ahead lifts 6% when the player is right
  behind it, and rivals far ahead ease off up to 24%.
- **Rivals only fight back when you lead** — the AI's speed and acceleration
  boost only activates while the player is P1, giving them a chance to chase
  without ever making the climb to the front unfair.
- **Auto-recovery** — if a crash leaves you nearly stopped while holding the
  throttle for ~2.6 s, the car is placed back on the racing line automatically.
  You can always reset manually with `R`.

All of these knobs live in [`src/game/balance.js`](src/game/balance.js).

### Practice

Open **Circuits**, select any circuit and press **PRACTICE**. A practice session
is a solo three-lap run with no AI rivals and no diamond pickups. It never pays
diamonds or XP and does not change records, history or progression, so you can
experiment freely. Practice is available even on locked circuits — use it to
learn a track before meeting its unlock requirement.

---

## Install on Android (PWA)

Installing gives a fullscreen app icon, landscape orientation and offline play.

### Option A — Recommended: USB + `adb reverse`

This gives the phone a real `localhost` origin, which Android treats as a secure
context, so the install prompt works properly.

1. Enable **Developer options → USB debugging** on the phone.
2. Connect the phone by USB and accept the debugging prompt.
3. Start the game on the laptop with `start-game.bat`.
4. With `adb` available, run:

   ```powershell
   adb reverse tcp:5173 tcp:5173
   ```

5. On the phone, open **<http://localhost:5173>** in Chrome.
6. Chrome menu **⋮ → Add to Home screen / Install app**.
7. Rotate to landscape and launch **Apex Drift** from the home screen.

### Option B — Same Wi-Fi (quick play)

1. Start `start-game.bat`. The console prints a `Phone:` URL, for example
   `http://192.168.1.24:5173`.
2. Open that URL in Chrome on the phone.
3. It plays immediately, but plain LAN HTTP is not a secure context on Android,
   so browsers may only offer a plain home-screen shortcut rather than a full PWA
   install. Use Option A (or put the folder behind an HTTPS tunnel) for the full
   installable app and offline caching.

### Option C — HTTPS tunnel

Run an HTTPS tunnel to port 5173 (for example a trusted tunnel tool you already
use), open the HTTPS URL on the phone and use **Install app** from the Chrome menu.

> Windows Firewall may ask for permission the first time. Allow Node.js on
> **private networks** if you want to play over Wi-Fi.

### Android app package (TWA)

The Play Store build is a Trusted Web Activity that loads the hosted game, so a
web release is automatically picked up by the Android app — only the version
metadata has to move.

- `android-twa/twa-manifest.json` — Bubblewrap/PWABuilder input (package
  `com.codefyx.apexdrift`, fullscreen, landscape, start URL
  `/ApexDrift/?source=pwa`). Currently `appVersionName` **1.1.3**,
  `appVersionCode` **3**.
- `pwabuilder-output/apexdrift-options.json` — the same settings exported from
  PWABuilder, kept in sync with the manifest.
- `playstore/` and `playstore-pwa/` — staging folders for generated bundles.

Rebuild the AAB after changing the manifest:

```powershell
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://codefyx.github.io/ApexDrift/manifest.webmanifest
bubblewrap build
```

`bubblewrap build` writes `app-release-bundle.aab` and signs it with the key you
created during `init`. Remember to raise `appVersionCode` for every Play upload.

### Release checklist

1. Bump `VERSION` in `sw.js` (cache key) and the displayed version in
   `index.html` / `package.json`.
2. Raise `appVersionName` and `appVersionCode` in
   `android-twa/twa-manifest.json` and `appVersion` in
   `pwabuilder-output/apexdrift-options.json`.
3. `npm run check` — validates every circuit spline.
4. Commit to `main`; the GitHub Pages workflow deploys the new build, and the
   installed PWA updates on the next launch after its service worker refreshes.

---

## Progression

| Circuit | Unlock requirement |
| --- | --- |
| Sunset Coast | Open from the start |
| Neon Harbor | Complete a race at Sunset Coast |
| Canyon Vault | Finish top 5 at Neon Harbor |
| Alpine Rush | Finish on the podium at Canyon Vault |

Each race pays diamonds based on finishing position, lap consistency, drift
score, diamond pickups, a clean race and personal bests. Diamonds buy upgrades
and styling in the Garage. Every race also grants XP and can unlock achievements
(claimable in Rewards). Practice sessions do not count toward these rewards or
circuit unlock requirements.

The **Rewards** page holds the daily sponsor bonus, level progress and
achievement payouts. The **History** page keeps the last races with full payout
breakdowns and lap splits.

---

## Project layout

```
ApexDrift/
  index.html               app shell and all menu markup
  styles.css               full UI + HUD styling
  manifest.webmanifest     PWA metadata
  sw.js                    offline service worker
  server.js                zero-dependency static server
  start-game.bat           Windows launcher
  icons/                   app icons (SVG + PNG + maskable)
  assets/
    fonts/                 local Orbitron + Rajdhani
    vendor/                local Three.js r160 + postprocessing
  src/
    main.js                app orchestration, routing, results
    state.js               save data, economy, progression
    audio.js               synthesised music and SFX
    data/                  tracks, upgrades, paints, achievements
    game/                  physics, AI, balance, camera, race loop
    render/                procedural car, world, scenery, showroom
    ui/                    HUD and input
  tools/check-tracks.mjs   circuit geometry validator
  android-twa/             TWA manifest + Play Store build notes
  pwabuilder-output/       PWABuilder export kept in sync with the TWA manifest
  playstore/               generated Play Store bundles/staging
  .github/workflows/       GitHub Pages deployment
```

### Useful commands

```powershell
npm start          # serve the game
npm run check      # validate circuit splines for self-intersections
```

---

## Save data and reset

Progress is stored in `localStorage` under `apexdrift.save.v1` on the browser or
installed app that you play in. It is not synced between devices.

To reset: **Settings → Career → RESET CAREER**. This clears diamonds, upgrades,
records, achievements and history.

To force-refresh the offline cache after editing game files, unregister the
service worker in DevTools → Application → Service Workers, or bump `VERSION`
in `sw.js`.

---

## Troubleshooting

**The page is blank or the menu never appears**
Serve over HTTP (`npm start`), not `file://`. Press `F12` and check the Console
for module or WebGL errors.

**WebGL is not available**
Enable hardware acceleration in the browser settings and update the graphics
driver. Try Chrome or Edge.

**The PWA install option is missing on Android**
The page needs a secure context. Use `adb reverse` with `http://localhost:5173`,
or an HTTPS URL. Also make sure you are not in a private/incognito tab.

**The game stutters on a phone**
Set **Graphics → LOW**, close other tabs, and disable battery saver.

**No sound**
Tap **IGNITE** once to satisfy the browser autoplay rule, then check
**Settings → Audio**.

---

## Credits

Built with [Three.js](https://threejs.org) r160 (MIT). Fonts: Orbitron and
Rajdhani (SIL Open Font License). All cars, tracks, textures, scenery and audio
are generated procedurally in this project.
