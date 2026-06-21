(function () {
  // ── Build the overlay ────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    display:        'none',
    position:       'fixed',
    inset:          '0',
    background:     'rgba(0,0,0,0.55)',
    zIndex:         '1000',
    alignItems:     'center',
    justifyContent: 'center',
    fontFamily:     'system-ui, -apple-system, sans-serif',
  });

  overlay.innerHTML = `
    <div style="
      background: #1e1e2e;
      color: #cdd6f4;
      border-radius: 12px;
      padding: 28px 36px 24px;
      min-width: 320px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.7);
      position: relative;
    ">
      <button id="dbg-close" style="
        position: absolute; top: 12px; right: 14px;
        background: none; border: none; color: #6c7086;
        font-size: 20px; cursor: pointer; line-height: 1;
      " title="Close (Esc)">✕</button>

      <h2 style="margin: 0 0 20px; font-size: 18px; color: #89b4fa; letter-spacing: 0.05em;">
        Debug Menu
      </h2>

      <p style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase;
                letter-spacing: 0.1em; color: #6c7086;">Jump to level</p>
      <div id="dbg-levels" style="display: flex; gap: 8px; margin-bottom: 20px;"></div>

      <p style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase;
                letter-spacing: 0.1em; color: #6c7086;">Cutscenes</p>
      <div id="dbg-cutscenes" style="display: flex; gap: 8px; margin-bottom: 20px;"></div>

      <p style="margin: 0 0 8px; font-size: 11px; text-transform: uppercase;
                letter-spacing: 0.1em; color: #6c7086;">Cheats</p>
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px;">
        <input type="checkbox" id="dbg-invincible" style="width: 16px; height: 16px; cursor: pointer;">
        Invincible
      </label>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── Button factory ───────────────────────────────────────────────────────────
  function makeBtn(label, hint, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = hint;
    Object.assign(b.style, {
      background:   '#313244',
      color:        '#cdd6f4',
      border:       '1px solid #45475a',
      borderRadius: '8px',
      padding:      '8px 16px',
      fontSize:     '14px',
      cursor:       'pointer',
    });
    b.addEventListener('mouseover', () => b.style.background = '#45475a');
    b.addEventListener('mouseout',  () => b.style.background = '#313244');
    b.addEventListener('click', onClick);
    return b;
  }

  // ── Invincibility checkbox ───────────────────────────────────────────────────
  document.getElementById('dbg-invincible').addEventListener('change', function () {
    debugInvincible = this.checked;
    player.invincible = debugInvincible ? Infinity : 0;
  });

  // ── Cutscene button (static) ─────────────────────────────────────────────────
  document.getElementById('dbg-cutscenes').appendChild(
    makeBtn('Opening Cutscene', 'Play the opening cutscene', jumpToCutscene)
  );

  // ── Open / close ─────────────────────────────────────────────────────────────
  let prevPaused = false;

  function open() {
    // Populate level buttons fresh each time (in case LEVELS changes)
    const container = document.getElementById('dbg-levels');
    container.innerHTML = '';
    // LEVELS is a global const in engine.js — accessible by name, not via window
    for (let i = 0; i < LEVELS.length; i++) {
      (function (idx) {
        container.appendChild(makeBtn('Level ' + (idx + 1), '', function () {
          jumpToLevel(idx);
        }));
      }(i));
    }

    prevPaused = paused;
    paused = true;
    if (audioCtx) audioCtx.suspend();
    overlay.style.display = 'flex';
  }

  function close() {
    overlay.style.display = 'none';
    paused = prevPaused;
    if (!prevPaused && audioCtx) audioCtx.resume();
  }

  document.getElementById('dbg-close').addEventListener('click', close);

  // ── Navigation ───────────────────────────────────────────────────────────────
  function jumpToLevel(idx) {
    close();
    // Write directly to the global let bindings in engine.js
    currentLevelIdx = idx;
    currentLevel    = LEVELS[idx];
    titleScreen     = false;
    cutscene        = false;
    paused          = false;
    stopCutsceneMusic();
    stopVictoryMusic();
    resetGame();
    startMusic();
  }

  function jumpToCutscene() {
    close();
    titleScreen  = false;
    cutscene     = true;
    cutsceneTime = 0;
    paused       = false;
    stopMusic();
    stopVictoryMusic();
    startCutsceneMusic();
  }

  // ── Key buffer — type "debug" anywhere to toggle ──────────────────────────
  let buf = '';
  document.addEventListener('keydown', function (e) {
    if (e.key.length === 1) {
      buf = (buf + e.key.toLowerCase()).slice(-5);
      if (buf === 'debug') {
        buf = '';
        overlay.style.display === 'none' ? open() : close();
        e.stopPropagation();
        return;
      }
    }

    if (overlay.style.display === 'none') return;

    // Swallow all keys while the menu is visible
    e.stopPropagation();
    e.preventDefault();
    if (e.code === 'Escape')  { close();          return; }
    if (e.code === 'Digit1')  { jumpToLevel(0);   return; }
    if (e.code === 'Digit2')  { jumpToLevel(1);   return; }
    if (e.code === 'KeyC')    { jumpToCutscene();  return; }
  }, true /* capture phase */);
}());
