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

    putBack(item) {
        this.queue.unshift(item);
    }
}

const queue = new ProcessQueue();

module.exports = {
    queue
};
