// Expert-mode obstacle: a medium-thick white bar that spins around its own
// center at a fixed point in the arena. Physics/collision (flinging entities
// off it) lives in physics.js's flingOffWall(); this class only owns its own
// geometry, rotation, and rendering.
export class Wall {
    constructor(centerX, centerY, length, angle, angularVelocity) {
        this.centerX = centerX;
        this.centerY = centerY;
        this.length = length;
        this.thickness = 8;
        this.angle = angle;
        this.angularVelocity = angularVelocity; // radians/frame, signed (spin direction)
        this.color = '#ffffff';
    }

    update() {
        this.angle += this.angularVelocity;
    }

    // Closest point on the wall's segment to (px, py), plus `t`: the signed
    // distance of that point from the center along the wall's own axis
    // (negative on one side, positive on the other) — used by flingOffWall
    // to get the rigid-body tangential velocity at the contact point.
    closestPoint(px, py) {
        const halfLength = this.length / 2;
        const dirX = Math.cos(this.angle);
        const dirY = Math.sin(this.angle);
        const relX = px - this.centerX;
        const relY = py - this.centerY;
        const t = Math.max(-halfLength, Math.min(halfLength, relX * dirX + relY * dirY));
        return { x: this.centerX + dirX * t, y: this.centerY + dirY * t, t };
    }

    draw(ctx) {
        const halfLength = this.length / 2;
        const dx = Math.cos(this.angle) * halfLength;
        const dy = Math.sin(this.angle) * halfLength;

        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.thickness;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.centerX - dx, this.centerY - dy);
        ctx.lineTo(this.centerX + dx, this.centerY + dy);
        ctx.stroke();
        ctx.restore();
    }
}
