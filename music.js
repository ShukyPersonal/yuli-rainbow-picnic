(function () {
  'use strict';

  const VOLUME = 0.18;
  let audio = null;
  let desired = { playing: false, muted: false, enabled: true };
  let playbackRequested = false;
  let requestVersion = 0;

  function wantsPlayback() {
    return desired.playing && desired.enabled && !desired.muted && !document.hidden;
  }

  function pauseAudio() {
    requestVersion += 1;
    playbackRequested = false;
    if (audio) {
      try { audio.pause(); } catch (_) { /* Sound remains optional. */ }
    }
  }

  function createAudio() {
    const source = window.YULI_ASSETS && window.YULI_ASSETS.music;
    if (!source || typeof source.src !== 'string' || !source.src) return null;
    if (typeof window.Audio !== 'function') return null;
    try {
      const player = new window.Audio(source.src);
      player.loop = true;
      player.preload = 'none';
      player.volume = VOLUME;
      return player;
    } catch (_) {
      return null;
    }
  }

  function setState(next) {
    const value = next || {};
    desired = {
      playing: value.playing === true,
      muted: value.muted === true,
      enabled: value.enabled !== false,
    };

    if (!wantsPlayback()) {
      // An inactive state can be sent repeatedly without touching the player.
      if (playbackRequested || (audio && !audio.paused)) pauseAudio();
      return;
    }
    if (playbackRequested) return;

    // One attempt per active transition. A blocked autoplay attempt stays quiet
    // until another real game/control gesture changes the state.
    playbackRequested = true;
    const thisRequest = ++requestVersion;
    if (!audio) audio = createAudio();
    if (!audio) return;

    try {
      const result = audio.play();
      Promise.resolve(result).then(() => {
        // A play promise can resolve after pause, mute, or a tab switch.
        if (!wantsPlayback() || !playbackRequested) {
          try { audio.pause(); } catch (_) { /* Optional audio. */ }
        }
      }).catch(() => {
        // AbortError during pause and browser autoplay restrictions are normal.
        // Never retry in a frame loop, throw, or interfere with the game.
        if (thisRequest !== requestVersion) return;
      });
    } catch (_) {
      // Older browsers can throw synchronously from play(). The next inactive
      // transition makes another gesture-driven attempt possible.
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAudio();
  });

  window.YULI_MUSIC = Object.freeze({ setState });
}());
