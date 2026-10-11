# Yuli’s Rainbow Picnic

A gentle browser game built with AI for my daughter. Walk through a meadow, meet three animal friends and reach a unicorn picnic. The game runs offline and uses plain HTML, CSS and JavaScript.

## Play locally

Download this repository with **Code → Download ZIP**, extract it, and open `index.html` in Chrome or Safari. No installation, build step or account is needed. Press Space, click or tap to begin and jump. On macOS, `Play Yuli.command` also opens the game.

## Update artwork

The editable artwork, soundtrack and sprite definitions are included. After changing an asset or `asset-manifest.json`, rebuild the embedded offline assets with Node.js:

```sh
node tools/rebuild-assets.mjs
```

Then reopen `index.html` to check the result.

## Personalize the game kit

## For parents

1. Extract this ZIP into a new folder.
2. Open `index.html` in Chrome or Safari. Press Space, click or tap to play and jump.
3. Attach the ZIP to your AI and paste the prompt from `AI_PROMPT.md`.
4. Give your AI your child's name, outfit and favorite things. You can choose an invented cartoon hero or provide a photo as a likeness reference.
5. Ask your AI to give you a finished game and check it before your child plays.

The game automatically walks and waits indefinitely before obstacles. There are no lives, timers or game-over screens. Parent controls include pause, restart, music, mute and fullscreen. The source is plain HTML, CSS and JavaScript; no framework, package installation or account is needed for local play.

## For the AI helping you

- `game.js`: movement, jumps, animals, drawing, controls. Walking speed is 105 pixels/second. Each replay generates fifteen shuffled obstacles with bounded gaps; the run takes about 90 seconds plus time waiting for input. `createRun(seed)` builds a reproducible layout. The three friends join after obstacles 1, 8 and 14. Every run includes logs, puddles, mushrooms, stones, a fruit bush, leaves and cakes. Sixteen optional airborne rainbows reward extra jumps between obstacles; each pickup sparkles, chimes and increments the rainbow badge. Missed rainbows have no penalty. The finish has a six-second dance with Yuli, the unicorn, a cake and fireworks before the replay card.
- `index.html`, `style.css`: interface and layout.
- `assets.js`: embedded artwork and music for offline play.
- `asset-manifest.json`: readable asset filenames, sprite frame rectangles and anchors.
- `tools/rebuild-assets.mjs`: rebuilds `assets.js` from the manifest using Node.js, with no dependencies. If Node is unavailable, use your own file tools to produce the same data URLs; do not make the parent perform setup work.
- `music.js`: original music controller.
- `assets/`: active cartoon artwork, original soundtrack and artwork prompts. No source family photographs are included.
- `HERO_GUIDE.md`: details for replacing the hero correctly.
- `clone-ui.js`: hosted sharing dialog. It deliberately stays hidden when opened as a local file. For a hosted copy, place a current source ZIP named `clone-kit.zip` beside `index.html` so visitors can download your own kit.

Keep updates in a new copy. To publish a personalized game, deploy the folder as a static site using the parent's chosen provider. Only publish when requested. Sites defaults to private; sharing requires changing its access. Do not include source photos, credentials or unrelated files in your deployment or kit.
