//------------------------------------------------
// msgqueue.js
//------------------------------------------------

// 필요한 패키지: npm install dotenv restify
const restify = require('restify');
const crypto = require('crypto');
const fs = require('fs');

// load environment variables from .env file
require('dotenv').config();

// 환경 변수 (.env 파일에서 관리)
const msgPort = process.env.MessageQueuePort || 8080;
const messageQueueApiKey = process.env.MessageQueueApiKey || '';

// API Key Authentication
const apiKeyAuth = (req, res, next) => {
    const clientKey = req.headers['x-api-key'];

    if (!clientKey) {
        console.error('MQ API Key missing in HTTP request header!');
        return res.send(401, { error: 'API 키가 누락되었습니다.' })
    }

    // 보안 강화: 타임 상수 비교
    try {
        const isMatch = crypto.timingSafeEqual(
            Buffer.from(clientKey),
            Buffer.from(messageQueueApiKey)
        );

        if (isMatch) {
            //console.log('MQ API key identical');
            next();
        } else {
            console.error('MQ API Key NOT identical!');
            res.send(403, { error: '권한이 없습니다.' })
        }
    } catch (e) {
        console.error('MQ API Key NOT same length!');
        res.send(403, { error: '권한이 없습니다.' })
    }
};

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

    print() {
        if (this.queue.size === 0) {
            console.log('\n--- 메시지 큐가 비어있습니다 ---');
            return;
        }
        this.queue.forEach((messages, id) => {
            console.log(`\n--- ${id} 내용 ---`);
            messages.forEach((msg, index) => {
                console.log(`${index + 1}: '${msg}'`);
            });
        });
    }
}

// 메시지 큐 인스턴스 생성
const msgQueue = new MessageQueue();

// Message Queue REST 서버 생성
const serverOptions = {
    certificate: fs.readFileSync('cert.pem'),
    key: fs.readFileSync('key.pem')
};
//const msgQueueServer = restify.createServer();  // HTTP 서버
const msgQueueServer = restify.createServer(serverOptions);  // HTTPS 서버
msgQueueServer.use(restify.plugins.bodyParser());

// Message Queue 헬스체크 엔드포인트
msgQueueServer.get('/', apiKeyAuth, async (req, res) => {
    msgQueue.print();
    res.send('Message Queue 서버가 실행 중입니다.');
});

// Message Queue REST 서버 시작
msgQueueServer.listen(msgPort, () => {
    console.log(`\n[${new Date().toLocaleString()}] Message Queue Server listening to ${msgQueueServer.url}`);
    console.log('Message Queue 서버 시작됨.\n');
});

// Reset message queue for specified user
msgQueueServer.post('/reset', apiKeyAuth, async (req, res) => {
    const id = req.body.id;
    msgQueue.reset(id);
    console.log(`Message Queue ${id}가 초기화되었습니다.`);
    res.send(`Message Queue ${id}가 초기화되었습니다.`);
});

// Retrieve a message
msgQueueServer.post('/dequeue', apiKeyAuth, async (req, res) => {
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
