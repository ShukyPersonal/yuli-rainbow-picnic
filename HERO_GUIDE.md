# Make your child the hero

## Start with the parent

Ask for the child's name, preferred outfit, colors and favorite animals. Offer an invented cartoon hero or a cartoon likeness from a parent-supplied reference. Use a consistent, fully clothed character in comfortable everyday clothes. Keep the child's reference photos out of the downloadable kit.

## Replace the character artwork

Replace both the walking sheet (`hero`) and action sheet (`heroPoses`). The existing saved artwork prompts in `assets/` describe the visual style, transparent background and pose requirements. Rewrite their character descriptions for the new child. Do not keep Yuli's action poses after replacing her walking sheet.

Walking normally uses four frames: alternating feet with subtle clothing motion. The action sheet uses `idle`, `waiting`, `jump` and `celebrate`. Generate or illustrate a consistent character, outfit, proportions and face across these poses. Match the soft cartoon style of the animal friends.

Save replacement PNGs in `assets/`. In `asset-manifest.json`, update `hero.file`, `hero.frames`, `heroPoses.file` and `heroPoses.frames`. Each frame has:

| Field | Meaning |
| --- | --- |
| `x`, `y`, `w`, `h` | Frame rectangle in source-image pixels; must fit inside the image. |
| `anchorX` | Horizontal foot/stance anchor as a fraction of the frame width. |
| `anchorY` | Vertical ground anchor as a fraction of frame height; normally1. |
| `drawHeight` | Rendered character height;184is the current default. |

Align the feet to the same ground line, keep the head height consistent and avoid adding transparent margins that change the apparent size between frames. Check the glow drawing in `drawLandingGlow` after changing foot positions. For a first simple version, a single transparent standing image may be one walking frame and all four named poses; replace it with animated frames later.

Rebuild embedded assets by running `node tools/rebuild-assets.mjs` from the extracted game folder. The helper reads the manifest and makes data URLs, preserving shared sources without duplication. The new game should work with networking unavailable.

## Update the name and appearance everywhere

Search `index.html` and `game.js` for Yuli: title, wordmark, start/finish labels, canvas descriptions and spoken/live announcements. Update preference-storage prefixes for the new game. If keeping fallback drawings, change their hair/outfit/appearance as well. Keep the internal `YULI_ASSETS` and `YULI_MUSIC` API names unless all references are renamed together. Delete unused old hero artwork from your personalized kit.

## Check before handing it over

- Complete all ten obstacles and meet all three animal friends.
- Check optional rainbow pickups: walking underneath must not collect them; jumps should, and restart resets the badge.
- Replay several times: layouts should vary while keeping about90seconds of active play.
- Check the large fireworks and unicorn hops; reduced motion uses static stars.
- Wait at every obstacle without input; no progress should be lost.
- Check early jumps, click/tap, held Space and repeat presses.
- Check pause/resume, restart, music/mute and glowing shoes.
- Look at all walking, waiting, jumping and celebration poses; no old hero faces should remain. The finish has six seconds of dancing with the unicorn, a candlelit cake, and fireworks before the wrap-up card.
- Try a smaller window and the parent's intended browser.
- Build a fresh source ZIP from the personalized files. For a hosted game with Clone game enabled, serve it as `clone-kit.zip`.
