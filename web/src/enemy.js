// How much of a temporary top-speed boost survives from one frame to the
// next (see speedMultiplier below) — 0.9823 decays a boost back to roughly
// its resting value of 1 over about 3s at 60fps (sqrt(0.965): half the decay
// rate of the previous 0.965/~1.5s value, i.e. twice as slow to settle).
const SPEED_BOOST_DECAY = 0.9823;

export class Enemy {
    constructor(x, y, targetX, targetY, radius = 15) {
        this.radius = radius;
        this.x = x;
        this.y = y;
        this.color = '#ff0000';

        const angle = Math.atan2(targetY - y, targetX - x);
        const speed = 2.0 + Math.random() * 3.0; // 2.0 to 5.0 random speed
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.converging = false;
        this.arrived = false;

        // Temporary multiplier on the normal 5.0 speed cap below, set by
        // flingOffWall (physics.js) when an Expert-mode wall knocks this
        // enemy — without this, the fling's extra velocity gets clamped
        // straight back down to the normal cap on the very next frame and
        // is never actually visible. Eases back toward 1 every frame.
        this.speedMultiplier = 1;
    }

    // Switches the enemy into a straight-line, high-speed rush toward a fixed
    // point (used for the game-over "swarm" effect), bypassing gravity/walls.
    startConverging(targetX, targetY) {
        this.converging = true;
        this.arrived = false;
        this.targetX = targetX;
        this.targetY = targetY;
    }

    update(canvasWidth, canvasHeight, player) {
        if (this.converging) {
            if (this.arrived) return;

            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const CONVERGE_SPEED = 14;

            if (distance < CONVERGE_SPEED) {
                this.x = this.targetX;
                this.y = this.targetY;
                this.arrived = true;
                return;
            }

            this.vx = (dx / distance) * CONVERGE_SPEED;
            this.vy = (dy / distance) * CONVERGE_SPEED;
            this.x += this.vx;
            this.y += this.vy;
            return;
        }

        // Gravity implementation
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distanceSq = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSq);
        
        if (distance > 0) {
            const G = 2000; // Significantly increased to create a strong "pull"
            const force = G / Math.max(distanceSq, 20); // Smaller floor to allow stronger pull when closer
            this.vx += (dx / distance) * force;
            this.vy += (dy / distance) * force;
        }

        // Cap speed at 5.0, boosted temporarily by speedMultiplier right after a wall fling
        const maxSpeed = 5.0 * this.speedMultiplier;
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > maxSpeed) {
            this.vx = (this.vx / speed) * maxSpeed;
            this.vy = (this.vy / speed) * maxSpeed;
        }
        this.speedMultiplier = 1 + (this.speedMultiplier - 1) * SPEED_BOOST_DECAY;

        this.x += this.vx;
        this.y += this.vy;

        if (this.x < this.radius) {
            this.x = this.radius;
            this.vx *= -1;
        } else if (this.x > canvasWidth - this.radius) {
            this.x = canvasWidth - this.radius;
            this.vx *= -1;
        }

        if (this.y < this.radius) {
            this.y = this.radius;
            this.vy *= -1;
        } else if (this.y > canvasHeight - this.radius) {
            this.y = canvasHeight - this.radius;
            this.vy *= -1;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Core
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();

        // Spikes (virus-like)
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * this.radius * 0.6, Math.sin(angle) * this.radius * 0.6);
            ctx.lineTo(Math.cos(angle) * this.radius, Math.sin(angle) * this.radius);
            ctx.stroke();
            ctx.closePath();
        }
        
        ctx.restore();
    }
}
