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
        this.queueName = 'MsgQueue';
        this.queue = new Map();
        
        this.queue.set(this.queueName, []);
    }

    isEmpty() {
        return this.queue.get(this.queueName).length === 0;
    }

    reset() {
        this.queue.set(this.queueName, []);
    }

    enqueue(message) {
        this.queue.get(this.queueName).push(message);
    }

    dequeue() {
        if (this.isEmpty()) {
            return null;
        } else {
            return this.queue.get(this.queueName).shift();
        }
    }

    print() {
        console.log(`\n--- ${this.queueName} 내용 ---`);
        this.queue.get(this.queueName).forEach((msg, index) => {
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
    msgQueue.reset();
    console.log('Message Queue가 초기화되었습니다.');
    res.send('Message Queue가 초기화되었습니다.');
});

msgQueueServer.post('/dequeue', async (req, res) => {
    const message = msgQueue.dequeue();
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
