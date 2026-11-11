# Domus TV — Home Assistant dashboards on your TV

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz/docs/faq/custom_repositories/)
[![Validate](https://github.com/Namarusa/domus-tv/actions/workflows/validate.yml/badge.svg)](https://github.com/Namarusa/domus-tv/actions/workflows/validate.yml)

Design TV dashboards in Home Assistant with the mouse, then use them on the **Freebox Player** (Delta / Révolution) or an **LG webOS TV** with the remote: lights, covers and gate, thermostats, locks, sensors with graphs, cameras with action buttons.

![Dashboard on the TV](docs/tv-dashboard.jpg)

This repository holds both parts:

| Part | Folder | What it does |
|---|---|---|
| Home Assistant integration `domus_tv` | `custom_components/domus_tv` | Adds a **Domus TV** page (editor + pairing), stores dashboards, serves them to the Player |
| Freebox app **Domus** | `tv/` | QML app for the Freebox Player (FreeStore: *Domus*) |
| Web app **Domus** | `web/` | Same app for LG webOS (and later Samsung, Android TV); reuses the logic in `tv/js` |

## Install the integration

### With HACS (recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Namarusa&repository=domus-tv&category=integration)

Or manually in HACS: **⋮ → Custom repositories** → `https://github.com/Namarusa/domus-tv`, type **Integration** → download **Domus TV** → restart Home Assistant.

### Manually

Copy `custom_components/domus_tv` into your `config/custom_components/` folder and restart Home Assistant.

### Then

**Settings → Devices & services → Add integration → Domus TV.** A **Domus TV** entry appears in the sidebar (admins only).

## Design dashboards

![Editor](docs/editor.png)

- One tab per dashboard (they become pages on the TV), 3 to 8 columns, drag tiles to reorder.
- Per tile: entity, type, name, icon, colour, size, **graph** (sensors: 6 h → 7 days) and up to 4 **linked actions** (e.g. gate + front door on a camera tile).
- **Toute une pièce** adds every visible entity of an area in one click.
- Save: the TV updates within 2 seconds.

## Pair the Player

1. Open **Domus** on the Freebox Player and type the Home Assistant address with the remote.
2. The TV shows a 6-digit code: type it in **Domus TV → Écrans**.

The Player receives a long-lived token for your user; revoke it from the same page at any time.

![Camera with linked actions](docs/tv-camera.jpg)

### Remote

| Key | Action |
|---|---|
| Arrows | move between tiles |
| OK | main action (toggle, run scene, open camera…) |
| Info | detail panel: brightness, setpoint, cover position, 24 h graph, linked actions |
| Menu | dashboards, reload, change address |
| P+ / P-, 1–9 | change dashboard |
| Back | close; twice to quit |

Locks always ask for a second OK.

## Network note

The Player must reach Home Assistant at a non-`10.0.0.x` address: the Player uses 10.0.0.x internally. If Home Assistant sits behind another router on 10.0.0.x, forward TCP 8123 from that router's Freebox-side address.

## API used by the Player

| Endpoint | Auth |
|---|---|
| `POST /api/domus_tv/pair/start`, `GET /api/domus_tv/pair/poll/{secret}` | none (pairing only) |
| `GET /api/domus_tv/layout`, `/states`, `/history` | Bearer |
| `POST /api/domus_tv/action` | Bearer — only entities placed on a dashboard |

---

Unofficial project, not affiliated with Home Assistant, the Open Home Foundation or Free. Icons: Material Design Icons (Apache 2.0).

## LG webOS TV (beta)

The web client in `web/` is the same app as the Freebox one (same dashboards, pairing, cameras, linked actions).
It reuses `tv/js/model.js`, `mdi.js` and `theme.js`; `web/tools/build.py` wraps them for the browser.

```
python3 web/tools/build.py --url http://192.168.1.10:8123 --ipk   # needs: npm i -g @webos-tools/cli
```

This gives `web/dist/www/` (open `index.html` in a desktop browser to try it) and `web/dist/*.ipk` for the TV.

Install on the TV in developer mode: create a free account on webostv.developer.lge.com, install the
**Developer Mode** app from the LG Content Store, sign in and turn it on, then from the PC:

```
ares-setup-device            # add the TV: its IP, port 9922, user prisoner
ares-novacom --device tv --getkey   # passphrase shown in the Developer Mode app
ares-install --device tv web/dist/fr.namarusaja.app.domus_1.2.0_all.ipk
```

Remote: arrows + OK, **Back** (twice to quit), **red** = menu, **green** or **Info** = details,
**CH+/CH−** or **1–9** = switch dashboard. The Magic Remote pointer works too (hover to select, click to act).
