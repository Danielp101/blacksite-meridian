# Blacksite: Meridian

Blacksite: Meridian is a complete, dependency-free browser FPS. Explore an abandoned polar relay station, fight autonomous sentries, and survive an endless sequence of increasingly difficult waves.

The game uses a custom Canvas 2D ray caster, a deterministic JavaScript simulation, generated Web Audio effects, and standard browser APIs. There are no runtime packages, external assets, trackers, or network requests.

## Requirements

- A current desktop version of Chrome, Edge, Firefox, or Safari
- A keyboard and mouse
- Node.js 20 or newer for the included local server, tests, and distribution builder

Pointer Lock and Canvas 2D must be enabled. The game is designed for desktop play; touch controls are not included.

## Install and run

No package installation is required.

1. Download or clone the project.
2. Open a terminal in the project folder.
3. Start the local server:

   ```bash
   npm run serve
   ```

4. Open <http://127.0.0.1:4173> in a desktop browser.
5. Enter a player name, select **Enter the station**, then allow the browser to capture the mouse.

The game must be served over HTTP. Opening `index.html` directly with a `file://` URL can prevent ES modules and Pointer Lock from working correctly.

## Controls

| Action | Control |
| --- | --- |
| Move | `W`, `A`, `S`, `D` |
| Look | Mouse, drag in Codex tabs, or `←` / `→` |
| Fire | Primary mouse button |
| Sprint | Left or right `Shift` |
| Reload | `R` |
| Pause / resume | `P` or `Esc` to release the pointer |
| Restart after defeat | `Enter` or the restart button |

The pistol holds 8 rounds. Reloading transfers rounds from the reserve and takes a little over one second. Enemies are damaged by center-crosshair hits only when there is no wall between the player and the target.

## Gameplay

- Each wave spawns sentries in valid, separated locations around the arena.
- Sentries pursue, avoid stacking, and fire visible projectiles when they have line of sight.
- Eliminations and cleared waves award score; each new wave restores enough reserve ammunition to remain winnable.
- Enemy count, health, movement, and attack rate scale through wave 10.
- Later waves continue indefinitely at the wave-10 difficulty cap.
- Reaching zero health ends the run; restart resets health, score, ammo, and waves without reloading the page.
- At game-over, the final numeric score is submitted once to the class arcade under the entered player name.

## Class arcade integration

Score submissions are handled by `src/score-api.js`. The game sends this JSON contract to `https://ai-club-arcade-1t3z.vercel.app/api/scores`:

```json
{
  "playerName": "Player name",
  "score": 0
}
```

`SCORE_ENDPOINT` is an exported constant near the top of that file, so it can be changed without touching gameplay. Player names are trimmed and limited to 32 characters. Scores must be finite, non-negative numbers and are submitted as integers. A failed request never blocks restart or changes the run score.

The arcade validates the browser's origin. Register the deployed Vercel URL under **Add a Game** before testing a completed run; requests from localhost or command-line tools are rejected with `origin_not_allowed`.

## Test

Run the complete automated suite:

```bash
npm test
```

The suite uses Node's built-in test runner and requires no installed dependencies. It covers deterministic game creation, collision and anti-tunnelling, movement, ray-wall intersection, firing and reload state, visible-target selection, wall occlusion, damage and game-over, restart, enemy pursuit and attack, wave spawning/scaling, and repeatable distribution packaging.

## Build the distribution

Create a clean, deployable copy in `dist/`:

```bash
npm run build
```

The builder removes stale output and copies the complete static runtime. To test that exact output locally:

```bash
npm run serve -- --dist
```

Then open <http://127.0.0.1:4173>.

## Deploy to Vercel

The repository includes `vercel.json` and needs no framework preset or build dependencies.

### Vercel CLI

1. Run `npm run build`.
2. From the project root, run `vercel`.
3. Keep the detected output directory as `dist` and leave the build command empty.

### Vercel dashboard

1. Import the repository as a new project.
2. Choose **Other** for the framework preset.
3. Set the output directory to `dist` if Vercel does not read it from `vercel.json`.
4. Use `npm run build` as the build command, or build and upload the `dist/` directory directly.

## Project structure

```text
.
├── index.html              Accessible game shell and overlays
├── styles.css              Relay-station visual system and HUD
├── src/
│   ├── audio.js            Generated Web Audio cues
│   ├── input.js            Pointer-lock-free keyboard turning
│   ├── main.js             Input, pointer lock, loop, and UI state
│   ├── renderer.js         Ray-cast world, sprites, and weapon
│   ├── score-api.js        Class arcade score submission client
│   └── simulation.js       Deterministic gameplay and collision
├── tests/
│   ├── dist.test.js        Distribution integrity tests
│   └── simulation.test.js  Gameplay behavior tests
├── scripts/
│   ├── build-dist.mjs      Repeatable static distribution builder
│   └── serve.mjs           Dependency-free local HTTP server
├── dist/                   Ready-to-deploy generated game
├── package.json
└── vercel.json
```

## Browser notes and troubleshooting

- **The mouse is not captured:** click **Resume operation** and allow Pointer Lock. Browser settings, embedded previews, or managed-device policies can block it.
- **Playing in a Codex tab:** Codex tabs may refuse Pointer Lock. The game automatically stays playable; hold and drag on the game view or use `←` / `→` to turn.
- **There is no sound:** interact with the start button first. Browsers require a user gesture before Web Audio can play. The game remains playable when audio is unavailable.
- **The screen is blank:** serve the project over HTTP and confirm Canvas 2D is enabled. Do not open the page using `file://`.
- **Movement continues after switching windows:** returning to the game clears held keys; click resume to capture the mouse again.
- **Motion sensitivity:** enable “Reduce motion” in the operating system. The game removes camera shake, weapon kick, scanning lines, and long UI animations.

## Technical overview

The simulation is intentionally independent of browser APIs. It owns state, collision, combat, enemy behavior, projectiles, and waves, while the browser entrypoint translates user input into fixed 60 Hz updates. The renderer casts narrow wall columns, keeps a depth buffer for sprite occlusion, and draws enemies, projectiles, effects, the weapon, and HUD feedback. This split makes gameplay deterministic and directly testable without mocks or a browser test dependency.

## License

This project is provided as a self-contained demonstration. You may modify and deploy it for personal or commercial projects.
