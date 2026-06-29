const LEVEL4 = (() => {
  const platforms = [
    // ── ground: opening stretch (indices 0-2, x: 0–1340) ────────────────────
    { x:    0, y: 460, w: 340, h: 25 },  // 0  start slab
    { x:  460, y: 460, w: 160, h: 25 },  // 1  gap: 120
    { x:  740, y: 460, w: 160, h: 25 },  // 2  gap: 120
    { x: 1020, y: 460, w: 160, h: 25 },  // 3  gap: 120
    { x: 1300, y: 460, w: 160, h: 25 },  // 4  gap: 120

    // ── ground: gaps widen (indices 5-12, x: ~1580–4120) ────────────────────
    { x: 1580, y: 460, w: 140, h: 25 },  // 5  gap: 120
    { x: 1860, y: 460, w: 140, h: 25 },  // 6  gap: 140
    { x: 2160, y: 460, w: 140, h: 25 },  // 7  gap: 160
    { x: 2480, y: 460, w: 130, h: 25 },  // 8  gap: 180
    { x: 2810, y: 460, w: 130, h: 25 },  // 9  gap: 200
    { x: 3150, y: 460, w: 130, h: 25 },  // 10 gap: 210
    { x: 3490, y: 460, w: 130, h: 25 },  // 11 gap: 210
    { x: 3830, y: 460, w: 120, h: 25 },  // 12 gap: 210

    // ── ground: final stretch (indices 13-15, x: ~4140–5400) ────────────────
    { x: 4140, y: 460, w: 160, h: 25 },  // 13 gap: 190
    { x: 4460, y: 460, w: 160, h: 25 },  // 14 gap: 160
    { x: 4760, y: 460, w: 160, h: 25 },  // 15 gap: 140
    { x: 5040, y: 460, w: 360, h: 25 },  // 16 end slab

    // ── elevated tier 1 (~y=360) ─────────────────────────────────────────────
    { x:  200, y: 360, w: 140, h: 20 },  // 17
    { x:  540, y: 340, w: 130, h: 20 },  // 18
    { x:  820, y: 360, w: 130, h: 20 },  // 19
    { x: 1100, y: 340, w: 130, h: 20 },  // 20
    { x: 1380, y: 360, w: 130, h: 20 },  // 21
    { x: 1660, y: 340, w: 130, h: 20 },  // 22
    { x: 1950, y: 360, w: 130, h: 20 },  // 23
    { x: 2240, y: 340, w: 130, h: 20 },  // 24
    { x: 2560, y: 360, w: 130, h: 20 },  // 25
    { x: 2880, y: 340, w: 130, h: 20 },  // 26
    { x: 3220, y: 360, w: 130, h: 20 },  // 27
    { x: 3560, y: 340, w: 130, h: 20 },  // 28
    { x: 3900, y: 360, w: 130, h: 20 },  // 29
    { x: 4210, y: 340, w: 130, h: 20 },  // 30
    { x: 4530, y: 360, w: 130, h: 20 },  // 31
    { x: 4830, y: 340, w: 130, h: 20 },  // 32

    // ── elevated tier 2 (~y=250) ─────────────────────────────────────────────
    { x:  360, y: 250, w: 120, h: 20 },  // 33
    { x:  660, y: 270, w: 120, h: 20 },  // 34
    { x:  950, y: 250, w: 120, h: 20 },  // 35
    { x: 1230, y: 270, w: 120, h: 20 },  // 36
    { x: 1510, y: 250, w: 120, h: 20 },  // 37
    { x: 1800, y: 270, w: 120, h: 20 },  // 38
    { x: 2090, y: 250, w: 120, h: 20 },  // 39
    { x: 2390, y: 270, w: 120, h: 20 },  // 40
    { x: 2700, y: 250, w: 120, h: 20 },  // 41
    { x: 3020, y: 270, w: 120, h: 20 },  // 42
    { x: 3350, y: 250, w: 120, h: 20 },  // 43
    { x: 3680, y: 270, w: 120, h: 20 },  // 44
    { x: 4020, y: 250, w: 120, h: 20 },  // 45
    { x: 4330, y: 270, w: 120, h: 20 },  // 46
    { x: 4650, y: 250, w: 120, h: 20 },  // 47
    { x: 4960, y: 270, w: 120, h: 20 },  // 48

    // ── Volcano escape shaft (~x=2700) ───────────────────────────────────────
    { x: 2620, y: 120, w: 160, h: 20 },  // 49  reachable from tier-2 at y=250
  ];

  // Cave is disabled for level 4 — win condition is handled by the engine
  // via the volcano escape sequence
  const cave = { x: 99999, y: 0, w: 1, h: 1 };

  function makeLeopard(x, platRef, speed, range = 200) {
    const plat = platforms[platRef];
    const patrolLeft  = Math.max(plat.x, x - range);
    const patrolRight = Math.min(plat.x + plat.w, x + range);
    return { x, y: plat.y - 44, w: 44, h: 44, vx: speed * 2.4, dir: 1,
             alive: true, hp: 2, maxHp: 2, platRef, hitFlash: 0,
             type: 'leopard',
             patrolLeft, patrolRight,
             update(e, dt) {
               e.x += e.vx * e.dir * dt;
               if (e.x <= e.patrolLeft)              { e.x = e.patrolLeft;              e.dir = 1; }
               if (e.x + e.w >= e.patrolRight) { e.x = e.patrolRight - e.w; e.dir = -1; }
             } };
  }

  function makeMosquito(x, y, speed = 1.6) {
    return {
      x, y, w: 30, h: 20,
      alive: true, hp: 2, maxHp: 2,
      hitFlash: 0,
      type: 'mosquito',
      speed,
      wingT: Math.random() * Math.PI * 2,
      alerted: false,
      update(e, dt) {
        e.wingT += dt * 0.5;
        const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
        const dy = (player.y + player.h / 2) - (e.y + e.h / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 220) e.alerted = true;
        if (dist > 380) e.alerted = false;
        if (e.alerted) {
          if (dist > 25) {
            e.x += (dx / dist) * e.speed * dt;
            e.y += (dy / dist) * e.speed * dt;
          }
        } else {
          e.y += Math.sin(e.wingT * 0.25) * 0.4;
        }
      }
    };
  }

  function createEnemies() {
    return [
      // ground leopards
      makeLeopard( 490,  1, 2.0),
      makeLeopard(1050,  3, 2.3),
      makeLeopard(1610,  5, 2.5),
      makeLeopard(2190,  7, 2.7),
      makeLeopard(2840,  9, 2.9),
      makeLeopard(3520, 11, 3.1),
      makeLeopard(4170, 13, 3.3),
      makeLeopard(4790, 15, 3.5),
      // mosquitoes
      makeMosquito( 600, 270, 2.6),
      makeMosquito(1200, 300, 2.8),
      makeMosquito(1900, 260, 2.9),
      makeMosquito(2600, 290, 3.0),
      makeMosquito(3300, 270, 3.1),
      makeMosquito(4000, 300, 3.2),
      makeMosquito(4700, 260, 3.3),
      makeMosquito(5100, 280, 3.4),
    ];
  }

  return { platforms, cave, createEnemies };
})();
