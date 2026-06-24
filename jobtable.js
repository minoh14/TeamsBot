//------------------------------------------------
// jobtable.js
//------------------------------------------------

// Any user can run only one job at a time
class JobTable {
    constructor() {
        this.jobs = new Map();
    }

    setJob(userId, jobId) {
        this.jobs.set(userId, jobId);
    }

    getJob(userId) {
        if (this.table.has(userId)) {
            return this.table.get(userId);
        } else {
            return null;
        }
    }
}

const table = new JobTable();

module.exports = {
    table
};
