export function resolveCollision(e1, e2) {
    const dx = e2.x - e1.x;
    const dy = e2.y - e1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // distance === 0 (e.g. two enemies spawned at the exact same corner in
    // the same frame) would divide by zero below, propagating NaN into
    // vx/vy and permanently breaking that enemy's physics from then on.
    if (distance > 0 && distance < e1.radius + e2.radius) {
        const nx = dx / distance;
        const ny = dy / distance;
        const p = 2 * (e1.vx * nx + e1.vy * ny - e2.vx * nx - e2.vy * ny) / 2;

        e1.vx -= p * nx;
        e1.vy -= p * ny;
        e2.vx += p * nx;
        e2.vy += p * ny;

        const overlap = e1.radius + e2.radius - distance;
        e1.x -= nx * overlap / 2;
        e1.y -= ny * overlap / 2;
        e2.x += nx * overlap / 2;
        e2.y += ny * overlap / 2;
    }
}

export function checkCollision(p, e) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    return Math.sqrt(dx * dx + dy * dy) < p.radius + e.radius;
}

// Shoves `entity` out of an immovable circular `obstacle` (no velocity change).
// Used for the player against the corner launchers, which are just scenery to it.
export function pushOutOfCircle(entity, obstacle) {
    const dx = entity.x - obstacle.x;
    const dy = entity.y - obstacle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = entity.radius + obstacle.radius;

    if (distance > 0 && distance < minDistance) {
        const nx = dx / distance;
        const ny = dy / distance;
        entity.x = obstacle.x + nx * minDistance;
        entity.y = obstacle.y + ny * minDistance;
    }
}

// Bounces `entity` off an immovable circular `obstacle` by mirroring its
// velocity across the contact normal. Used for enemies against the launchers.
export function reflectOffCircle(entity, obstacle) {
    const dx = entity.x - obstacle.x;
    const dy = entity.y - obstacle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = entity.radius + obstacle.radius;

    if (distance > 0 && distance < minDistance) {
        const nx = dx / distance;
        const ny = dy / distance;
        entity.x = obstacle.x + nx * minDistance;
        entity.y = obstacle.y + ny * minDistance;

        const dot = entity.vx * nx + entity.vy * ny;
        entity.vx -= 2 * dot * nx;
        entity.vy -= 2 * dot * ny;
    }
}

// A rotating bar's surface moves — a point at signed distance `t` from the
// pivot, on a bar spinning at `angularVelocity` (radians/frame) currently at
// `angle`, has tangential (rigid-body) velocity angularVelocity * t in the
// direction (-sin(angle), cos(angle)). FLING_BOOST exaggerates that into a
// dramatic launch rather than a physically-accurate nudge.
const FLING_BOOST = 6;

// How much a wall hit temporarily raises an enemy's normal top-speed cap
// (see Enemy.speedMultiplier, enemy.js) — the player has no such cap to
// raise (it always jumps straight to the mouse position), so this only
// takes effect on entities with a velocity (vx/vy), i.e. enemies.
const ENEMY_WALL_SPEED_BOOST = 2;

const WALL_SWEEP_SAMPLES = 16;

// Shoves `entity` out of a rotating `wall` (see wall.js) and flings it along
// the wall's tangential motion at the contact point, boosted for drama. Used
// for both the player (positional-only, since it has no persistent velocity
// — it'll be overwritten by mouse position next frame regardless) and
// enemies (added to vx/vy, same as any other velocity source).
//
// `fromX`/`fromY` (optional) is the entity's position *before* this frame's
// movement. The player jumps straight to the mouse position each frame (no
// per-frame distance cap like enemies have), so a single check at its final
// position can jump clean over the wall's thin hit-band without ever
// registering as a collision — "passing through" it. Passing the previous
// position samples several points along this frame's movement path and
// resolves at the first one that overlaps the wall, which catches that case.
// Enemies move in small capped steps each frame, so they don't need this —
// omit fromX/fromY for them and it checks only the current position.
export function flingOffWall(entity, wall, fromX = entity.x, fromY = entity.y) {
    const samples = fromX === entity.x && fromY === entity.y ? 1 : WALL_SWEEP_SAMPLES;

    for (let i = 1; i <= samples; i++) {
        const f = i / samples;
        const sampleX = fromX + (entity.x - fromX) * f;
        const sampleY = fromY + (entity.y - fromY) * f;

        const closest = wall.closestPoint(sampleX, sampleY);
        const dx = sampleX - closest.x;
        const dy = sampleY - closest.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = entity.radius + wall.thickness / 2;

        if (distance > 0 && distance < minDistance) {
            const nx = dx / distance;
            const ny = dy / distance;
            entity.x = closest.x + nx * minDistance;
            entity.y = closest.y + ny * minDistance;

            const tangentialSpeed = wall.angularVelocity * closest.t * FLING_BOOST;
            const flingX = -Math.sin(wall.angle) * tangentialSpeed;
            const flingY = Math.cos(wall.angle) * tangentialSpeed;

            if (entity.vx !== undefined) {
                entity.vx += flingX;
                entity.vy += flingY;
                entity.speedMultiplier = ENEMY_WALL_SPEED_BOOST;
            } else {
                entity.x += flingX;
                entity.y += flingY;
            }
            return;
        }
    }
}
