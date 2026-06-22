const LEVEL3 = (() => {
  const platforms = [
    // Left cave floor — long standing platform for the player
    { x:   0, y: 460, w: 500, h: 25 },  // 0  left floor
    // Right cave floor — after the boss pond
    { x: 890, y: 460, w: 200, h: 25 },  // 1  right floor
  ];

  // Exit cave — win trigger after boss is defeated
  const cave = { x: 1020, y: 350, w: 60, h: 110 };

  function createEnemies() { return []; }

  return { platforms, cave, createEnemies };
})();
