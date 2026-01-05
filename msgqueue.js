//------------------------------------------------
// msgqueue.js
//------------------------------------------------

// 필요한 패키지: npm install dotenv restify
const restify = require('restify');

// load environment variables from .env file
require('dotenv').config();

// 환경 변수 (.env 파일에서 관리)
const msgPort = process.env.MessageQueuePort || 8080;

// 메시지 큐 클래스
class MessageQueue {
    constructor() {
        this.queue = new Map();
    }

    isEmpty(id) {
        if (!this.queue.has(id)) {
            return true;
        } else {
            return this.queue.get(id).length === 0;
        }
    }

    reset(id) {
        if (!this.queue.has(id)) {
            return;
        } else {
            this.queue.set(id, []);
        }
    }

    enqueue(id, message) {
        if (!this.queue.has(id)) {
            this.queue.set(id, []);
        }

        this.queue.get(id).push(message);
    }

    dequeue(id) {
        if (this.isEmpty(id)) {
            return null;
        } else {
            return this.queue.get(id).shift();
        }
    }

    print(id) {
        console.log(`\n--- ${id} 내용 ---`);
        this.queue.get(id).forEach((msg, index) => {
            console.log(`${index + 1}: '${msg}'`);
        });
    }
}

// 메시지 큐 인스턴스 생성
const msgQueue = new MessageQueue();

// Message Queue REST 서버 생성
const msgQueueServer = restify.createServer();
msgQueueServer.use(restify.plugins.bodyParser());

// Message Queue 헬스체크 엔드포인트
msgQueueServer.get('/', async (req, res) => {
    msgQueue.print();
    res.send('Message Queue 서버가 실행 중입니다.');
});

// Message Queue REST 서버 시작
msgQueueServer.listen(msgPort, () => {
    console.log(`\nMessage Queue Server listening to ${msgQueueServer.url}`);
    console.log('Message Queue 서버 시작됨.\n');
});

msgQueueServer.post('/reset', async (req, res) => {
    const id = req.body.id;
    msgQueue.reset(id);
    console.log(`Message Queue ${id}가 초기화되었습니다.`);
    res.send(`Message Queue ${id}가 초기화되었습니다.`);
});

msgQueueServer.post('/dequeue', async (req, res) => {
    const id = req.body.id;
    const message = msgQueue.dequeue(id);
    if (message) {
        console.log(`Dequeued message: ${message}`);
        res.send({ message: message });
    } else {
        //console.log('Message Queue is empty.');
        res.send({ message: null });
    }
});

module.exports = {
    msgQueue
};
