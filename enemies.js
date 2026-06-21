// enemies.js — stateful enemy definitions.
//
// The engine calls e.update(e, dt) each frame and nothing else.
// Everything here is plain JS — no engine internals required.
//
// State machine convention:
//   e.state      — current state name (string)
//   e.stateTimer — frames spent in current state (reset on transition)
//   e.states     — object mapping state name → handler fn(e, dt)
//
// Use changeState(e, name) to transition; it resets the timer.

function changeState(e, name) {
  e.state = name;
  e.stateTimer = 0;
}

// Returns an update function that drives a state machine.
// The enemy object must have: state, stateTimer, states.
function stateMachineUpdate(e, dt) {
  e.stateTimer += dt;
  e.states[e.state]?.(e, dt);
}

// ── Reusable state sets ───────────────────────────────────────────────────────

// Builds patrol / alert / chase states for a ground-level enemy.
//
//   patrolSpeed     — px/frame while patrolling
//   chaseSpeed      — px/frame while chasing
//   detectionRange  — horizontal px before alert triggers
//   alertDuration   — frames spent frozen before chasing begins
//   chaseTimeout    — frames before giving up the chase
//   losRange        — horizontal px at which the enemy gives up
function patrolAlertChaseStates({
  patrolSpeed,
  chaseSpeed,
  detectionRange = 180,
  alertDuration  = 45,
  chaseTimeout   = 360,
  loseRange      = 400,
} = {}) {
  return {
    patrol(e, dt) {
      e.x += patrolSpeed * e.dir * dt;
      if (e.x <= e.patrolLeft)              { e.x = e.patrolLeft;              e.dir =  1; }
      if (e.x + e.w >= e.patrolRight) { e.x = e.patrolRight - e.w; e.dir = -1; }

      const dx = player.x - (e.x + e.w / 2);
      const dy = player.y - e.y;
      if (Math.abs(dx) < detectionRange && Math.abs(dy) < 120) {
        e.dir = dx > 0 ? 1 : -1;
        changeState(e, 'alert');
      }
    },

    alert(e, dt) {
      // Freeze and face the player while winding up
      e.dir = (player.x + player.w / 2) > (e.x + e.w / 2) ? 1 : -1;
      if (e.stateTimer >= alertDuration) changeState(e, 'chase');
    },

    chase(e, dt) {
      e.dir = (player.x + player.w / 2) > (e.x + e.w / 2) ? 1 : -1;
      e.x += chaseSpeed * e.dir * dt;

      // Clamp to platform so enemy doesn't run off into the void
      const plat = currentLevel.platforms[e.platRef];
      e.x = Math.max(plat.x, Math.min(plat.x + plat.w - e.w, e.x));

      const dx = Math.abs((player.x + player.w / 2) - (e.x + e.w / 2));
      if (dx > loseRange || e.stateTimer > chaseTimeout) {
        changeState(e, 'patrol');
      }
    },
  };
}

// ── Enemy factories ───────────────────────────────────────────────────────────

// A raptor that patrols, then alerts and chases when the player gets close.
function makeChaseRaptor(x, platRef, platforms, speed = 2, range = 110) {
  const plat        = platforms[platRef];
  const patrolLeft  = Math.max(plat.x, x - range);
  const patrolRight = Math.min(plat.x + plat.w, x + range);

  const e = {
    x, y: plat.y - 44, w: 44, h: 44,
    dir: 1,
    alive: true, hp: 1, maxHp: 1,
    platRef, hitFlash: 0,
    patrolLeft, patrolRight,
    state: 'patrol',
    stateTimer: 0,
  };

  e.states = patrolAlertChaseStates({
    patrolSpeed:    speed * 1.8,
    chaseSpeed:     speed * 3.2,
    detectionRange: 200,
    alertDuration:  40,
    chaseTimeout:   300,
    loseRange:      380,
  });

  e.update = stateMachineUpdate;
  return e;
}
