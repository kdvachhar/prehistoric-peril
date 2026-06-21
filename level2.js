const LEVEL2 = (() => {
  const platforms = [
    // ── ground: no pits (indices 0-3, x: 0–2900) ────────────────────────────
    { x:   0, y: 460, w: 720, h: 25 },  // 0  start slab
    { x: 720, y: 460, w: 720, h: 25 },  // 1
    { x:1440, y: 460, w: 740, h: 25 },  // 2
    { x:2180, y: 460, w: 720, h: 25 },  // 3  ends at 2900

    // ── ground: gaps begin (indices 4-17, x: ~3060–6240) ────────────────────
    { x:3060, y: 460, w: 180, h: 25 },  // 4   gap: ~70
    { x:3310, y: 460, w: 180, h: 25 },  // 5   gap: ~60
    { x:3550, y: 460, w: 180, h: 25 },  // 6   gap: ~60
    { x:3790, y: 460, w: 180, h: 25 },  // 7   gap: ~50
    { x:4020, y: 460, w: 180, h: 25 },  // 8   gap: ~60
    { x:4260, y: 460, w: 180, h: 25 },  // 9   gap: ~50
    { x:4490, y: 460, w: 180, h: 25 },  // 10  gap: ~50
    { x:4720, y: 460, w: 180, h: 25 },  // 11  gap: ~40
    { x:4940, y: 460, w: 180, h: 25 },  // 12  gap: ~40
    { x:5170, y: 460, w: 180, h: 25 },  // 13  gap: ~40
    { x:5390, y: 460, w: 180, h: 25 },  // 14  gap: ~40
    { x:5620, y: 460, w: 180, h: 25 },  // 15  gap: ~40
    { x:5840, y: 460, w: 180, h: 25 },  // 16  gap: ~40
    { x:6060, y: 460, w: 180, h: 25 },  // 17  ends at 6240

    // ── ground: extension (indices 18-25, x: ~6330–8340) ────────────────────
    { x:6330, y: 460, w: 180, h: 25 },  // 18  gap: ~90
    { x:6570, y: 460, w: 180, h: 25 },  // 19  gap: ~60
    { x:6810, y: 460, w: 180, h: 25 },  // 20  gap: ~60
    { x:7060, y: 460, w: 180, h: 25 },  // 21  gap: ~70
    { x:7300, y: 460, w: 180, h: 25 },  // 22  gap: ~60
    { x:7550, y: 460, w: 180, h: 25 },  // 23  gap: ~70
    { x:7800, y: 460, w: 180, h: 25 },  // 24  gap: ~70
    { x:8060, y: 460, w: 280, h: 25 },  // 25  final — ends at 8340

    // ── elevated wood platforms (indices 26-48, 170px wide, 350px apart) ────
    { x: 150, y: 345, w: 170, h: 20 },  // 26
    { x: 500, y: 230, w: 170, h: 20 },  // 27
    { x: 850, y: 305, w: 170, h: 20 },  // 28
    { x:1200, y: 230, w: 170, h: 20 },  // 29
    { x:1550, y: 345, w: 170, h: 20 },  // 30
    { x:1900, y: 230, w: 170, h: 20 },  // 31
    { x:2250, y: 305, w: 170, h: 20 },  // 32
    { x:2600, y: 230, w: 170, h: 20 },  // 33
    { x:2950, y: 345, w: 170, h: 20 },  // 34
    { x:3300, y: 230, w: 170, h: 20 },  // 35
    { x:3650, y: 305, w: 170, h: 20 },  // 36
    { x:4000, y: 230, w: 170, h: 20 },  // 37
    { x:4350, y: 345, w: 170, h: 20 },  // 38
    { x:4700, y: 230, w: 170, h: 20 },  // 39
    { x:5050, y: 305, w: 170, h: 20 },  // 40
    { x:5400, y: 230, w: 170, h: 20 },  // 41
    { x:5750, y: 345, w: 170, h: 20 },  // 42
    { x:6100, y: 230, w: 170, h: 20 },  // 43
    { x:6450, y: 305, w: 170, h: 20 },  // 44
    { x:6800, y: 230, w: 170, h: 20 },  // 45
    { x:7150, y: 345, w: 170, h: 20 },  // 46
    { x:7500, y: 230, w: 170, h: 20 },  // 47
    { x:7850, y: 305, w: 170, h: 20 },  // 48

    // ── elevated wood platforms (indices 49-70, 130px wide, fill each gap) ──
    { x: 345, y: 305, w: 130, h: 20 },  // 49  between 26–27
    { x: 695, y: 345, w: 130, h: 20 },  // 50  between 27–28
    { x:1045, y: 345, w: 130, h: 20 },  // 51  between 28–29
    { x:1395, y: 305, w: 130, h: 20 },  // 52  between 29–30
    { x:1745, y: 305, w: 130, h: 20 },  // 53  between 30–31
    { x:2095, y: 345, w: 130, h: 20 },  // 54  between 31–32
    { x:2445, y: 345, w: 130, h: 20 },  // 55  between 32–33
    { x:2795, y: 305, w: 130, h: 20 },  // 56  between 33–34
    { x:3145, y: 305, w: 130, h: 20 },  // 57  between 34–35
    { x:3495, y: 345, w: 130, h: 20 },  // 58  between 35–36
    { x:3845, y: 345, w: 130, h: 20 },  // 59  between 36–37
    { x:4195, y: 305, w: 130, h: 20 },  // 60  between 37–38
    { x:4545, y: 305, w: 130, h: 20 },  // 61  between 38–39
    { x:4895, y: 345, w: 130, h: 20 },  // 62  between 39–40
    { x:5245, y: 345, w: 130, h: 20 },  // 63  between 40–41
    { x:5595, y: 305, w: 130, h: 20 },  // 64  between 41–42
    { x:5945, y: 305, w: 130, h: 20 },  // 65  between 42–43
    { x:6295, y: 345, w: 130, h: 20 },  // 66  between 43–44
    { x:6645, y: 345, w: 130, h: 20 },  // 67  between 44–45
    { x:6995, y: 305, w: 130, h: 20 },  // 68  between 45–46
    { x:7345, y: 305, w: 130, h: 20 },  // 69  between 46–47
    { x:7695, y: 345, w: 130, h: 20 },  // 70  between 47–48
  ];

  const cave = { x: 8320, y: 350, w: 60, h: 110 };

  function makeEnemy(x, platRef, speed, range = 110) {
    const plat = platforms[platRef];
    const patrolLeft  = Math.max(plat.x, x - range);
    const patrolRight = Math.min(plat.x + plat.w, x + range);
    return { x, y: plat.y - 44, w: 44, h: 44, vx: speed * 1.8, dir: 1,
             alive: true, hp: 1, maxHp: 1, platRef, hitFlash: 0,
             patrolLeft, patrolRight,
             update(e, dt) {
               e.x += e.vx * e.dir * dt;
               if (e.x <= e.patrolLeft)              { e.x = e.patrolLeft;              e.dir = 1; }
               if (e.x + e.w >= e.patrolRight) { e.x = e.patrolRight - e.w; e.dir = -1; }
             } };
  }

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

  function createEnemies() {
    return [
      // ── ground: leopards (every other platform) ───────────────────────────
      makeLeopard( 350,  0, 1.5),  // [0]  slab 1
      makeLeopard(1100,  1, 1.7),  // [1]  slab 2
      makeLeopard(2000,  2, 1.9),  // [2]  slab 3
      makeLeopard(2500,  3, 2.0),  // [3]  slab 4
      makeLeopard(3080,  4, 2.1),  // [4]  gap zone
      makeLeopard(3580,  6, 2.2),  // [6]
      makeLeopard(4050,  8, 2.3),  // [8]
      makeLeopard(4750, 11, 2.4),  // [11]
      makeLeopard(5220, 13, 2.5),  // [13]
      makeLeopard(5870, 16, 2.6),  // [16]
      makeLeopard(6380, 18, 2.7),  // [18]
      makeLeopard(6860, 20, 2.8),  // [20]
      makeLeopard(7350, 22, 2.9),  // [22]
      makeLeopard(7860, 24, 3.0),  // [24]
      // ── elevated: raptors ─────────────────────────────────────────────────
      makeEnemy( 230, 26, 1.6),  // [26] x=150–320  y=345
      makeEnemy( 930, 28, 1.9),  // [28] x=850–1020 y=305
      makeEnemy(1630, 30, 2.0),  // [30] x=1550–1720 y=345
      makeEnemy(3030, 34, 2.2),  // [34] x=2950–3120 y=345
      makeEnemy(4430, 38, 2.5),  // [38] x=4350–4520 y=345
      makeEnemy(5130, 40, 2.7),  // [40] x=5050–5220 y=305
      makeEnemy(6530, 44, 2.9),  // [44] x=6450–6620 y=305
      makeEnemy(7930, 48, 3.1),  // [48] x=7850–8020 y=305
      makeEnemy(2510, 55, 2.2),  // [55] x=2445–2575 y=345
      makeEnemy(6360, 66, 2.9),  // [66] x=6295–6425 y=345
      makeEnemy( 580, 27, 1.8),  // [27] x=500–670   y=230
      makeEnemy(1975, 31, 2.0),  // [31] x=1900–2070 y=230
      makeEnemy(3730, 36, 2.4),  // [36] x=3650–3820 y=305
      makeEnemy(5830, 42, 2.8),  // [42] x=5750–5920 y=345
      makeEnemy(7230, 46, 3.0),  // [46] x=7150–7320 y=345
      makeEnemy(1285, 29, 1.9),  // [29] x=1200–1370 y=230
      makeEnemy(2685, 33, 2.2),  // [33] x=2600–2770 y=230
      makeEnemy(4085, 37, 2.5),  // [37] x=4000–4170 y=230
      makeEnemy(5485, 41, 2.7),  // [41] x=5400–5570 y=230
      makeEnemy(6885, 45, 2.9),  // [45] x=6800–6970 y=230
    ];
  }

  return { platforms, cave, createEnemies };
})();
