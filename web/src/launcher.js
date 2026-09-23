// A fixed obstacle sitting in each of the 4 corners: a quarter-circle "launch
// pad" (the corner enemies spawn from) with a small rounded bulge pointing
// toward the center of the screen. Purely a physical obstacle — it has no
// behavior of its own; Game/physics.js handle collision against it.
const CORNERS = {
    'top-left': { getPos: (w, h) => ({ x: 0, y: 0 }), startAngle: 0, endAngle: Math.PI / 2 },
    'top-right': { getPos: (w, h) => ({ x: w, y: 0 }), startAngle: Math.PI / 2, endAngle: Math.PI },
    'bottom-right': { getPos: (w, h) => ({ x: w, y: h }), startAngle: Math.PI, endAngle: 3 * Math.PI / 2 },
    'bottom-left': { getPos: (w, h) => ({ x: 0, y: h }), startAngle: 3 * Math.PI / 2, endAngle: 2 * Math.PI },
};

export class Launcher {
    constructor(cornerId) {
        this.cornerId = cornerId;
        this.x = 0;
        this.y = 0;
        this.radius = 0;
        this.startAngle = 0;
        this.endAngle = 0;
        this.midAngle = 0;
        this.color = '#3a4a5c';
        this.accentColor = '#7fb2d9';
    }

    // Recomputed every frame so it always sits exactly on its corner even if
    // the window (and therefore the square canvas) is resized.
    update(canvasWidth, canvasHeight) {
        const corner = CORNERS[this.cornerId];
        const pos = corner.getPos(canvasWidth, canvasHeight);
        this.x = pos.x;
        this.y = pos.y;
        this.radius = Math.min(canvasWidth, canvasHeight) * 0.045;
        this.startAngle = corner.startAngle;
        this.endAngle = corner.endAngle;
        this.midAngle = (this.startAngle + this.endAngle) / 2;
    }

    draw(ctx) {
        // A gentle, rounded bulge (not a spike) blended directly into the
        // quarter-circle's outline, centered on the diagonal toward the screen.
        const bumpHalfAngle = (this.endAngle - this.startAngle) * 0.12;
        const bumpHeight = this.radius * 0.16;
        const bumpStartAngle = this.midAngle - bumpHalfAngle;
        const bumpEndAngle = this.midAngle + bumpHalfAngle;

        const pt = (angle, r) => ({
            x: this.x + Math.cos(angle) * r,
            y: this.y + Math.sin(angle) * r,
        });

        const bumpEnd = pt(bumpEndAngle, this.radius);
        // Control points pulled out past the target bulge height so the two
        // bezier segments meet as one smooth convex curve, not a sharp point.
        const ctrl1 = pt(this.midAngle - bumpHalfAngle * 0.55, this.radius + bumpHeight * 1.3);
        const ctrl2 = pt(this.midAngle + bumpHalfAngle * 0.55, this.radius + bumpHeight * 1.3);

        ctx.save();
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.accentColor;
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.arc(this.x, this.y, this.radius, this.startAngle, bumpStartAngle);
        ctx.bezierCurveTo(ctrl1.x, ctrl1.y, ctrl2.x, ctrl2.y, bumpEnd.x, bumpEnd.y);
        ctx.arc(this.x, this.y, this.radius, bumpEndAngle, this.endAngle);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}
