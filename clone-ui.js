(() => {
  'use strict';
  // Sharing controls belong to the hosted game. Offline copies still play normally.
  if (window.location.protocol === 'file:') return;
  const stage = document.getElementById('stage');
  if (!stage || document.getElementById('cloneButton')) return;
  const prompt = `Please make a personalized copy of the attached Rainbow Picnic game kit for my child. Read README.md, HERO_GUIDE.md and asset-manifest.json first. Do the technical work yourself.

Ask me for my child's name, favorite animals, colors and outfit. Ask whether I want to provide a reference photo or use an invented cartoon character. Create a consistent, fully clothed cartoon hero with matching walking and action poses. Replace both hero sprite sheets and all Yuli-specific text and fallback drawings. Update the frame rectangles and anchors in asset-manifest.json, then rebuild assets.js with tools/rebuild-assets.mjs or your own equivalent.

Keep the age-four-friendly game: automatic walking at 105 pixels per second, roughly 90-second runs with fifteen shuffled obstacles from seven kinds (logs, puddles, mushrooms, stones, fruit bushes, leaves and cakes) and bounded varying gaps, indefinite safe waits before obstacles, Space/click/tap to jump, forgiving guaranteed obstacle hops, three animal friends and a unicorn picnic. Keep the sixteen optional little rainbows floating above the walking stretches: collect them with well-timed extra jumps, count each once, and let missed rainbows have no penalty. Keep the original music, music/mute controls and light-up shoes, large rainbow fireworks, a cake with candles and six seconds of Yuli and unicorn dancing before the finish card. No lives, timers, punishment, ads or accounts for local play.

Work in a new copy. Keep the supplied world artwork as a starting point. Test the full adventure, pauses, restart, sound controls, input handling, sprite alignment and smaller screens. Give me a ready-to-play offline version and the complete updated source. Publish to my own hosting account only if I ask; preserve the current private audience when using Sites.`;
  const style = document.createElement('style');
  style.textContent = `
    .clone-button{position:absolute;right:18px;bottom:14px;z-index:5;border:1px solid #dedccc;border-radius:20px;padding:7px 13px;background:#fffaf0ec;color:#596952;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px #42573912}
    .clone-dialog{width:min(620px,calc(100vw - 28px));max-height:86svh;overflow:auto;padding:28px;border:1px solid #dedccc;border-radius:24px;background:#fffaf0;color:#47544c;box-shadow:0 20px 80px #293e4b40;font-family:ui-rounded,"Avenir Next",sans-serif}
    .clone-dialog::backdrop{background:#31453480;backdrop-filter:blur(4px)}
    .clone-dialog h2{font-size:30px;line-height:1.12;margin:0 32px 12px;letter-spacing:-.025em}
    .clone-dialog p,.clone-dialog li{font-size:15px;line-height:1.5;color:#5d6d59}
    .clone-dialog p{margin:12px 0}.clone-dialog ol{padding-left:22px;margin:15px 0}
    .clone-dialog textarea{display:block;width:100%;min-height:170px;max-height:30svh;resize:vertical;padding:13px;border:1px solid #cad1c1;border-radius:12px;background:#fffef9;color:#47544c;font:13px/1.5 ui-monospace,monospace}
    .clone-dialog label{display:block;font-size:14px;font-weight:650;margin:18px 0 8px}
    .clone-actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 0}
    .clone-actions button,.clone-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 16px;border:0;border-radius:12px;font-size:15px;font-weight:650;cursor:pointer;text-decoration:none;background:#956987;color:#fffdf6}
    .clone-actions a{background:#dfebd9;color:#435841}.clone-dialog .clone-close{position:absolute;right:16px;top:12px;background:transparent;border:0;color:#60705b;font-size:28px;cursor:pointer}
    .clone-status{min-height:24px;margin-bottom:0!important;font-size:13px!important}
    @media(max-width:700px){.clone-button{right:9px;bottom:7px;font-size:10px;padding:5px 9px}.clone-dialog{padding:21px}.clone-dialog h2{font-size:26px}.clone-dialog textarea{min-height:140px}}
  `;
  document.head.appendChild(style);
  const button = document.createElement('button');
  button.id = 'cloneButton'; button.className = 'clone-button'; button.type = 'button';
  button.textContent = 'Clone game'; button.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog');
  dialog.id = 'cloneDialog'; dialog.className = 'clone-dialog';
  dialog.setAttribute('aria-labelledby', 'cloneTitle');
  dialog.innerHTML = `<button class="clone-close" type="button" aria-label="Close clone window">×</button>
    <h2 id="cloneTitle">Their own little adventure</h2>
    <p>Make your child the hero. The kit includes the game source, cartoon artwork, original music and a step-by-step guide.</p>
    <ol><li>Download the game kit.</li><li>Copy the prompt below.</li><li>Attach the ZIP to your AI and paste the prompt. It will help you create your own character.</li></ol>
    <label for="clonePrompt">Prompt for your AI</label>
    <textarea id="clonePrompt" readonly spellcheck="false" aria-label="Prompt for your AI"></textarea>
    <div class="clone-actions"><a href="clone-kit.zip" download="Rainbow-Picnic-Game-Kit.zip">Download game kit</a><button type="button" id="copyClonePrompt">Copy prompt</button></div>
    <p class="clone-status" id="cloneStatus" role="status" aria-live="polite"></p>`;
  stage.appendChild(button); stage.appendChild(dialog);
  const field = dialog.querySelector('#clonePrompt'); field.value = prompt;
  const status = dialog.querySelector('#cloneStatus');
  let resumeOnClose = false;
  button.addEventListener('click', () => {
    const pause = document.getElementById('pauseButton');
    resumeOnClose = !!pause && !pause.disabled && pause.getAttribute('aria-label') === 'Pause game';
    if (resumeOnClose) pause.click();
    status.textContent = '';
    dialog.showModal();
  });
  dialog.querySelector('.clone-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    const pause = document.getElementById('pauseButton');
    if (resumeOnClose && !document.hidden && !pause?.disabled && pause?.getAttribute('aria-label') === 'Resume game') pause.click();
    resumeOnClose = false;
    document.getElementById('game')?.focus({ preventScroll: true });
  });
  window.addEventListener('keydown', event => {
    if (dialog.open) event.stopImmediatePropagation();
  }, true);
  dialog.querySelector('#copyClonePrompt').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(prompt);
      status.textContent = 'Prompt copied. Attach the game kit to your AI, then paste it.';
    } catch (_) {
      field.focus(); field.select();
      status.textContent = 'Prompt selected. Press Command+C or Ctrl+C to copy it.';
    }
  });
})();
