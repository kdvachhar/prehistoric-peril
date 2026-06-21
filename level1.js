const LEVEL1 = (() => {
  const platforms = [
    { x:   0, y: 460, w: 280, h: 25 },
    { x: 430, y: 460, w: 150, h: 25 },
    { x: 680, y: 460, w: 175, h: 25 },
    { x: 990, y: 460, w: 155, h: 25 },
    { x:1260, y: 460, w: 130, h: 25 },
    { x:1490, y: 460, w: 235, h: 25 },
    { x:1880, y: 460, w: 175, h: 25 },
    { x:2200, y: 460, w: 150, h: 25 },
    { x:2450, y: 460, w: 155, h: 25 },
    { x:2720, y: 460, w: 165, h: 25 },
    { x:3010, y: 460, w: 150, h: 25 },
    { x:3260, y: 460, w: 165, h: 25 },
    { x:3550, y: 460, w: 175, h: 25 },
    { x:3860, y: 460, w: 225, h: 25 },
    // elevated (original)
    { x: 270, y: 360, w: 150, h: 20 },
    { x: 500, y: 340, w: 140, h: 20 },
    { x: 690, y: 300, w: 140, h: 20 },
    { x: 880, y: 370, w: 150, h: 20 },
    { x:1080, y: 310, w: 140, h: 20 },
    { x:1310, y: 350, w: 140, h: 20 },
    { x:1530, y: 330, w: 150, h: 20 },
    { x:1730, y: 370, w: 150, h: 20 },
    { x:1940, y: 310, w: 140, h: 20 },
    { x:2100, y: 350, w: 150, h: 20 },
    // elevated (extended)
    { x:2510, y: 350, w: 150, h: 20 },
    { x:2790, y: 310, w: 140, h: 20 },
    { x:3060, y: 360, w: 150, h: 20 },
    { x:3310, y: 330, w: 140, h: 20 },
    { x:3460, y: 380, w: 150, h: 20 },
    { x:3630, y: 320, w: 110, h: 20 },
    { x:3790, y: 370, w: 100, h: 20 },
  ];

  const cave = { x: 4060, y: 350, w: 60, h: 110 };

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

  function createEnemies() {
    return [
      makeEnemy( 550,  1, 1.5),   // [1]  ground
      makeEnemy( 780,  2, 1.0),   // [2]  ground
      makeEnemy( 720, 16, 1.2),   // [16] elevated x=690
      makeEnemy( 920, 17, 1.4),   // [17] elevated x=880
      makeEnemy(1100, 18, 1.0),   // [18] elevated x=1080
      makeEnemy(1050,  3, 1.6),   // [3]  ground
      makeEnemy(1340, 19, 1.3),   // [19] elevated x=1310
      makeEnemy(1350,  4, 1.2),   // [4]  ground
      makeEnemy(1770, 21, 1.5),   // [21] elevated x=1730
      makeEnemy(1980, 22, 1.8),   // [22] elevated x=1940
      makeEnemy(2140, 23, 1.4),   // [23] elevated x=2100
      makeEnemy(2220,  7, 2.0),   // [7]  ground
      makeEnemy(2480,  8, 1.3),   // [8]  ground x=2450
      makeEnemy(2560, 24, 1.6),   // [24] elevated x=2510
      makeEnemy(2760,  9, 1.4),   // [9]  ground x=2720
      makeEnemy(2830, 25, 1.7),   // [25] elevated x=2790
      makeEnemy(3040, 10, 1.5),   // [10] ground x=3010
      makeEnemy(3090, 26, 1.3),   // [26] elevated x=3060
      makeEnemy(3280, 11, 1.6),   // [11] ground x=3260
      makeEnemy(3330, 27, 1.8),   // [27] elevated x=3310
      makeEnemy(3580, 12, 1.4),   // [12] ground x=3550
      makeEnemy(3650, 29, 1.9),   // [29] elevated x=3630
      makeEnemy(3820, 30, 1.7),   // [30] elevated x=3790
    ];
  }

  return { platforms, cave, createEnemies };
})();
