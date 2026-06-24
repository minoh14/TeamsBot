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

    peek() {
        if (this.isEmpty()) {
            return null;
        }
        return this.queue[0];
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
