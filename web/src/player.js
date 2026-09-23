export class Player {
    constructor(radius = 10) {
        this.radius = radius;
        this.x = 0;
        this.y = 0;
        this.color = '#00ff00';
    }

    update(input, canvasWidth, canvasHeight) {
        // Clamp to the canvas so the mouse leaving the window (or the canvas
        // edge, since input.js doesn't clamp) can't push the player off-screen.
        this.x = Math.min(Math.max(input.mouseX, this.radius), canvasWidth - this.radius);
        this.y = Math.min(Math.max(input.mouseY, this.radius), canvasHeight - this.radius);
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }
}
