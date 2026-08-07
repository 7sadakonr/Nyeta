// Test setup file for unit testing environment
// Provide mock browser globals if needed in tests
if (typeof window !== 'undefined') {
    if (window.HTMLMediaElement) {
        window.HTMLMediaElement.prototype.play = () => Promise.resolve();
        window.HTMLMediaElement.prototype.pause = () => {};
        window.HTMLMediaElement.prototype.load = () => {};
    }
}
