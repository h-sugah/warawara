export class Input {
    // `canvas` is injected rather than looked up internally, so this class
    // doesn't depend on a specific element id existing in the document.
    constructor(canvas) {
        this.mouseX = 0;
        this.mouseY = 0;
        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });
    }
}
