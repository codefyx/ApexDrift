/**
 * Balance tuning for the player's side of the race.
 *
 * Goals:
 *  1. The player always has the most stable, best-handling car on the grid.
 *  2. Crash-avoidance help keeps the player on the road.
 *  3. A mistake costs a couple of seconds, not the whole race.
 *  4. The player can always overtake and take the lead; rivals only get their
 *     speed/acceleration chance while the player is actually leading.
 *
 * Everything here is intentionally data-only so the race never has to guess at
 * magic numbers.
 */
export const BALANCE = {
  /* --- Catch-up assist (player only). Ramps in once the leader is clear. --- */
  catchUpStart: 35,        // metres behind the leader before help starts
  catchUpFull: 380,        // metres behind the leader for maximum help
  catchUpTopSpeed: 0.18,   // +18% top speed at full assist
  catchUpAccel: 0.30,      // +30% acceleration at full assist
  catchUpGrip: 0.16,       // +16% grip at full assist
  catchUpNitro: 1.60,      // nitro regeneration multiplier at full assist

  /* --- Always-on player handling edge: the player always has the best car. --- */
  playerGripAssist: 1.15,      // baseline grip multiplier on every difficulty
  playerStabilityBonus: 0.55,  // added to the stability stat
  playerStabilityFloor: 1.15,  // never below this, whatever the AI has

  /* --- Crash-avoidance steering help (player only). --- */
  assistLookahead: 0.30,       // seconds of lateral travel to look ahead
  assistLookaheadSpeed: 0.006, // extra look per m/s of speed
  assistSteerGain: 3.20,       // how hard the assist steers toward the line
  assistStart: 0.60,           // fraction of half-width where help starts
  assistMax: 1.00,             // max blend into the player's steering
  assistGrip: 3.00,            // extra grip near the edge so slides stop early
  assistMinSpeed: 3,           // no help while crawling or reversing
  assistCushion: 1.20,         // metres before the wall where the soft barrier sits
  assistCushionYaw: 0.92,      // yaw damping when the soft barrier is touched

  /* --- Slipstream: player drafting a rival ahead makes passing easy. --- */
  draftRange: 34,          // metres behind a rival for the tow
  draftWidth: 5.0,         // metres of lateral alignment for the tow
  draftTopSpeed: 0.10,     // +10% top speed at full tow
  draftAccel: 0.20,        // +20% acceleration at full tow

  /* --- Rival rubber band. The player keeps the edge. --- */
  aiBandRange: 240,        // metres of gap for the effect to reach full strength
  aiCatchUp: 0.12,         // rivals gain at most 12% when the player leads
  aiCatchUpAccel: 0.22,    // and up to 22% acceleration while the player leads
  aiSlowDown: 0.24,        // rivals lose at most 24% when they are far ahead
  aiYieldRange: 26,        // metres behind a rival where it lifts for a pass
  aiYield: 0.06,           // 6% lift so overtakes stick

  /* --- Crash forgiveness (player only; rivals keep the old behaviour). --- */
  wallRestitutionPlayer: 0.85,  // <1 absorbs the impact instead of bouncing off
  wallDampingPlayer: 0.975,     // speed kept after a wall scrape
  wallYawDampingPlayer: 0.72,   // keeps the car pointed down the track
  carImpulsePlayer: 0.38,       // softer car-to-car impulse
  carSeparationPlayer: 0.62,    // less shoving during contact
  offroadSpeedPlayer: 0.68,     // top-speed factor off the racing surface
  offroadGripPlayer: 0.62,      // grip factor off the racing surface

  /* --- Recovery. --- */
  autoRecoverTime: 2.6      // seconds nearly stopped, on the throttle, before a reset
};
