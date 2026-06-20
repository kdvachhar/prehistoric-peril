# Prehistoric Peril — Game Specification

## Overview

Single-file HTML5 canvas platformer. A caveman armed with a bat fights through a prehistoric landscape full of velociraptors to reach a cave at the end of the level. Renders at 1/4 resolution and upscales for a chunky pixel look.

## Technical Stack

- **Runtime:** Vanilla JavaScript, no dependencies
- **Renderer:** Canvas 2D API (offscreen canvas at `W/PSCALE × H/PSCALE`, blitted to a 900×520 display canvas)
- **Persistence:** `localStorage` (key: `prehistoricPeril_save`)
- **Entry point:** `index.html` (self-contained)

## Screens

### Title Screen
- Volcanic night background with erupting volcano and T-Rex silhouette
- Two buttons: **NEW GAME** and **LOAD GAME** (disabled/greyed if no save exists)
- Mouse hover highlights buttons; click starts the game

### Gameplay
Active once a button is clicked. See Gameplay section below.

### Pause Overlay
- Triggered by **Space** during gameplay
- Darkened overlay with "PAUSED" and "Space to resume" text
- No game state changes while paused

### Game Over Overlay
- Shown when player HP reaches 0
- Press **R** to restart

### Level Complete Overlay
- Shown when player walks into the cave
- Saves game to localStorage
- Press **R** to play again

## Controls

| Key | Action |
|-----|--------|
| ← / → | Move left / right |
| ↑ | Jump (only when on ground) |
| ↓ | Swing bat |
| Space | Pause / Resume |
| R | Restart (on game over or win) |

## Physics

| Constant | Value |
|----------|-------|
| Gravity | 1.1 px/frame² |
| Walk speed | 6.0 px/frame |
| Jump velocity | −18 px/frame |
| Horizontal friction | 0.65× per frame when no key held |

## Player

- **Size:** 38×58 px
- **HP:** 5 (displayed as hearts in HUD)
- **Spawn:** x=80, y=380
- **Invincibility frames:** 80 frames after taking enemy contact damage; 90 frames after falling off screen
- **Fall death:** losing 1 HP and respawning at current camera position when y > H+80
- **Visual:** Drawn caveman with loincloth, messy hair, animated legs (sine walk cycle), bat in right hand

### Bat Attack
- Triggered by ↓; one swing lasts 12 frames
- Hitbox active during frames 3–10 of the swing
- Hitbox: 54×18 px extended in the direction the player faces
- "WHACK!" text flashes on screen during the active window
- Enemy hit cooldown: enemy cannot be hit again for 20 frames after a hit

## Enemies

Velociraptors (green lizard with spines and tail).

| Property | Value |
|----------|-------|
| Size | 44×44 px |
| HP | 1 |
| Behavior | Patrol left/right within their assigned platform |
| Speed | Varies per enemy (1.0–2.0), multiplied by 1.8 at spawn |
| Damage on contact | 1 HP (player knocked back) |
| Death | Burst of gold/orange particles; removed from world |

Each enemy is assigned a platform index at creation and reverses direction at the platform's edges.

## Level Design

One continuous scrolling level. World width extends to ~4200 px.

### Platforms
Two layers:
- **Ground platforms** at y=460 with gaps the player must jump across
- **Elevated platforms** at y=300–380 with shorter widths for optional traversal

### Cave (Win Condition)
At world x=4060, y=350. Walking into it triggers level complete.

### Enemies (23 total)
Distributed across both ground and elevated platforms, with speeds increasing toward the end of the level.

## Camera

Smooth follow with lead:
- Target: `player.x − W × 0.35`
- Lerp factor: 0.1 per frame
- Clamped to minimum x=0

## Particles

Pooled array. Each particle has position, velocity, radius, color, and a lifetime (30–50 frames). Fades out by `life/maxLife` alpha. Gravity: 0.25 px/frame².

Triggered on:
- Player jump (dust)
- Enemy hit (orange/gold sparks)
- Enemy death (larger gold burst)
- Player taking damage (red/orange sparks)

## HUD

Drawn on the offscreen canvas (world-space coordinates):
- Semi-transparent rounded panel in top-left
- "HEALTH" label in gold
- 5 heart icons (red = alive, dark grey = lost)

## Visual Style

- **Background:** Sky gradient (blue → pale → sandy), parallax mountains (2 layers at 0.25× and 0.15× scroll), parallax clouds (0.12×), fixed sun
- **Platforms:** Brown dirt body with green grass top and tufts
- **Player/Enemies:** Procedural pixel-art shapes drawn with canvas primitives
- **Cave:** Rocky cliff with arched dark opening and stalactites

## Save Format

```json
{ "level": 1 }
```

Saved to `localStorage` on win. Load Game currently resets to level 1 (same as New Game).
