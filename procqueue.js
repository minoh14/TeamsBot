//------------------------------------------------
// procqueue.js
//------------------------------------------------

class ProcessQueue {
    constructor() {
        this.queue = [];
    }

    isEmpty() {
        return this.queue.length === 0;
    }

    enqueue(item) {
        this.queue.push(item);
    }

    dequeue() {
        if (this.isEmpty()) {
            return null;
        }
        return this.queue.shift();
    }
}

const processQueue = new ProcessQueue();

module.exports = {
    processQueue
};
