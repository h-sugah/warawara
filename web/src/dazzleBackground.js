// Animated background for Dazzle mode: soft, semi-transparent color shapes
// that drift, pulse, rotate, and morph between circle/square/triangle, plus
// an occasional wide striped sweep, all at a tempo that speeds up and slows
// down over time. Meant to be genuinely disorienting — but every knob here
// is chosen to stay clear of known visual-safety hazards:
//   - No discrete flashing / hard on-off contrast changes anywhere. Tempo
//     changes are eased over ~0.3s, not instant, and nothing strobes anywhere
//     near the ~3Hz+ range that triggers photosensitive seizures.
//   - No screen-shake or camera movement — only content *inside* the canvas
//     moves, so there's no vestibular/motion-sickness "self-motion" illusion.
//   - Stripes are few and wide (a handful of bands spanning the canvas), far
//     coarser than the fine, high-contrast repeating patterns implicated in
//     pattern-sensitive epilepsy, and blended in/out smoothly, never popped.
//   - Alpha/luminance stay moderate throughout on a dark, never-pure-black-
//     or-white base, so the scene never approaches a bright flash.
// If you tune this further, preserve those constraints — the goal is "harder
// to visually track," not literally strobing.
const SHAPES = ['circle', 'square', 'triangle', 'pentagon', 'hexagon', 'star'];
const POLYGON_SIDES = { triangle: 3, pentagon: 5, hexagon: 6 };

function addPolygonPath(ctx, sides, radius) {
    ctx.moveTo(0, -radius);
    for (let i = 1; i <= sides; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
}

function addStarPath(ctx, points, outerRadius, innerRadius) {
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = -Math.PI / 2 + (i * Math.PI) / points;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

const BLOB_CONFIGS = [
    { hue: 0, freqX: 0.0070, freqY: 0.0091, ampX: 0.30, ampY: 0.26, phaseX: 0.0, phaseY: 1.6, radiusBase: 0.30, radiusAmp: 0.06, radiusFreq: 0.0040, huePhase: 0 },
    { hue: 90, freqX: 0.0083, freqY: 0.0062, ampX: 0.26, ampY: 0.30, phaseX: 2.4, phaseY: 0.5, radiusBase: 0.26, radiusAmp: 0.05, radiusFreq: 0.0053, huePhase: 1.3 },
    { hue: 180, freqX: 0.0057, freqY: 0.0079, ampX: 0.28, ampY: 0.24, phaseX: 4.2, phaseY: 3.1, radiusBase: 0.28, radiusAmp: 0.07, radiusFreq: 0.0046, huePhase: 2.7 },
    { hue: 270, freqX: 0.0095, freqY: 0.0068, ampX: 0.24, ampY: 0.28, phaseX: 1.1, phaseY: 5.2, radiusBase: 0.24, radiusAmp: 0.05, radiusFreq: 0.0061, huePhase: 4.1 },
];

// Degrees of hue rotation per unit of (speed-scaled) time.
const HUE_ROTATE_SPEED = 0.08;
// Kept moderate on purpose: strong enough to blend colors together and mess
// with tracking the player/enemies, not so strong it washes out the scene.
const BLOB_ALPHA = 0.3;
// Shape crossfade duration, in frames at speedMultiplier=1 (~0.6s at 60fps).
const SHAPE_BLEND_FRAMES = 36;

function randomShapeExcluding(exclude) {
    const options = SHAPES.filter(s => s !== exclude);
    return options[Math.floor(Math.random() * options.length)];
}

export class DazzleBackground {
    constructor() {
        this.time = 0;
        this.speedMultiplier = 1;
        this.speedTarget = 1;
        this.speedChangeTimer = 0;
        this.stripePhase = 0;
        this.stripeAngle = Math.random() * Math.PI * 2;

        this.blobs = BLOB_CONFIGS.map(cfg => ({
            ...cfg,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() < 0.5 ? -1 : 1) * (0.004 + Math.random() * 0.006),
            shape: 'circle',
            prevShape: 'circle',
            shapeBlend: 1,
            shapeTimer: 120 + Math.random() * 240,
        }));
    }

    // Eases speedMultiplier toward a new random target every couple of
    // seconds, so the whole background's tempo surges and eases back down —
    // "sudden" in feel, but continuous in value (nothing teleports).
    updateTempo() {
        this.speedChangeTimer--;
        if (this.speedChangeTimer <= 0) {
            this.speedTarget = 0.4 + Math.random() * 2.6;
            this.speedChangeTimer = 90 + Math.random() * 150;
        }
        this.speedMultiplier += (this.speedTarget - this.speedMultiplier) * 0.06;
        this.time += this.speedMultiplier;
    }

    draw(ctx, width, height) {
        this.updateTempo();

        // Dark, steady base (never pure black or white) — all the motion and
        // brightness comes from the shapes, so overall luminance stays bounded.
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;
        const spread = Math.min(width, height);

        for (const b of this.blobs) {
            b.rotation += b.rotationSpeed * this.speedMultiplier;

            b.shapeTimer -= this.speedMultiplier;
            if (b.shapeTimer <= 0 && b.shapeBlend >= 1) {
                b.prevShape = b.shape;
                b.shape = randomShapeExcluding(b.shape);
                b.shapeBlend = 0;
                b.shapeTimer = 200 + Math.random() * 280;
            }
            if (b.shapeBlend < 1) {
                b.shapeBlend = Math.min(1, b.shapeBlend + this.speedMultiplier / SHAPE_BLEND_FRAMES);
            }

            const x = cx + Math.sin(this.time * b.freqX + b.phaseX) * spread * b.ampX;
            const y = cy + Math.cos(this.time * b.freqY + b.phaseY) * spread * b.ampY;
            const radius = spread * (b.radiusBase + Math.sin(this.time * b.radiusFreq) * b.radiusAmp);
            const hue = (b.hue + this.time * HUE_ROTATE_SPEED + b.huePhase * 30) % 360;

            if (b.shapeBlend < 1) {
                this.drawShape(ctx, b.prevShape, x, y, radius, b.rotation, hue, BLOB_ALPHA * (1 - b.shapeBlend));
            }
            this.drawShape(ctx, b.shape, x, y, radius, b.rotation, hue, BLOB_ALPHA * b.shapeBlend);
        }

        this.drawStripes(ctx, width, height);
    }

    drawShape(ctx, shape, x, y, radius, rotation, hue, alpha) {
        if (alpha <= 0) return;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);

        ctx.beginPath();
        if (shape === 'square') {
            ctx.rect(-radius, -radius, radius * 2, radius * 2);
        } else if (shape === 'star') {
            addStarPath(ctx, 5, radius * 1.2, radius * 0.5);
        } else if (POLYGON_SIDES[shape]) {
            addPolygonPath(ctx, POLYGON_SIDES[shape], radius * 1.1);
        } else {
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
        }
        ctx.clip();

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.3);
        gradient.addColorStop(0, `hsla(${hue}, 65%, 45%, ${alpha})`);
        gradient.addColorStop(1, `hsla(${hue}, 65%, 45%, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(-radius * 1.5, -radius * 1.5, radius * 3, radius * 3);

        ctx.restore();
    }

    // A handful of wide diagonal bands sweeping slowly across the canvas,
    // breathing in and out in intensity. The angle drifts continuously and
    // the sweep speed/direction wanders (and can reverse) via a slow
    // oscillator, so the stripes don't always run the same way. Deliberately
    // few and wide (not a fine repeating pattern) and low-to-moderate
    // contrast throughout.
    drawStripes(ctx, width, height) {
        this.stripeAngle += 0.0018 * this.speedMultiplier;
        const sweepSpeed = Math.sin(this.time * 0.0021) * 1.4;
        this.stripePhase += sweepSpeed * this.speedMultiplier;

        const intensity = Math.max(0, Math.sin(this.time * 0.006)) * 0.28;
        if (intensity <= 0.01) return;

        const bandCount = 5;
        const diagonal = Math.sqrt(width * width + height * height);
        const bandWidth = diagonal / bandCount;
        const hue = (this.time * HUE_ROTATE_SPEED * 1.5) % 360;

        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(this.stripeAngle);
        ctx.translate(-diagonal / 2, -diagonal / 2);

        const offset = this.stripePhase % (bandWidth * 2);
        for (let i = -2; i * bandWidth + offset < diagonal + bandWidth; i++) {
            const bx = i * bandWidth * 2 + offset;
            ctx.fillStyle = `hsla(${(hue + i * 40) % 360}, 60%, 50%, ${intensity})`;
            ctx.fillRect(bx, 0, bandWidth, diagonal);
        }

        ctx.restore();
    }
}
