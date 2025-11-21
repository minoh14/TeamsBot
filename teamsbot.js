//------------------------------------------------
// teamsbot.js
//------------------------------------------------

// 모듈 불러오기
const UIPATH = require('./uipath');
const MSGQUEUE = require('./msgqueue');

// 필요한 패키지: npm install botbuilder restify dotenv
require('dotenv').config();
const restify = require('restify');
const { BotFrameworkAdapter, TeamsActivityHandler, TurnContext, MessageFactory } = require('botbuilder');

// 환경 변수 (.env 파일에서 관리)
const botId = process.env.MicrosoftAppId || '';
const botPassword = process.env.MicrosoftAppPassword || '';
const botTenantId = process.env.MicrosoftAppTenantId || '';
const botPort = process.env.MicrosoftAppPort || 3978;
const polling_sec = process.env.PollingIntervalSeconds || 3;
const processTriggerKeywords = (process.env.ProcessTriggerKeywords || '거래처,거래선').split(',');
const botMessageSignature = process.env.BotMessageSignature || '(bot)';

// Bot Adapter 생성
const adapter = new BotFrameworkAdapter({
    appId: botId,
    appPassword: botPassword,
    appType: 'SingleTenant',
    tenantId: botTenantId
});

// 에러 핸들링
adapter.onTurnError = async (context, error) => {
    console.error(`\n[onTurnError] ${error}`);
    await context.sendActivity('봇에서 에러가 발생했습니다.');
};

// 현재 대화중인 사용자에게 메시지 보내기
async function sendMessageToCurrentUser(conversationReference, message) {
    if (!conversationReference) {
        console.error('사용자와의 대화 참조 정보가 없습니다.');
        return;
    }

    await adapter.continueConversation(conversationReference, async (context) => {
        await context.sendActivity(message);
    });
}

// 1:1 대화를 생성하여 메시지 보내기
async function createConversationAndSendMessage(userId, message) {
    const conversationParameters = {
        isGroup: false,
        bot: { id: botId },
        members: [{ id: userId }],
        tenantId: botTenantId
    };

    await adapter.createConversation(conversationParameters, async (context) => {
        await context.sendActivity(message);
    });
}

// Teams Bot 클래스
class TeamsBot extends TeamsActivityHandler {
    constructor() {
        super();

        // UiPath 인증 토큰
        this.token = null;

        // 봇과 1:1 대화중인 사용자 정보
        this.conversationReference = null;

        // 메시지 수신 핸들러
        this.onMessage(async (context, next) => {

            // 대화 참조 정보 저장
            this.conversationReference = TurnContext.getConversationReference(context.activity);
            //console.log(`User ID: ${this.conversationReference.user.id}`);

            //console.log(`채널 데이터: ${context.activity.channelData ? JSON.stringify(context.activity.channelData) : '없음'}`);
            //console.log(`텍스트 하이라이트: ${context.activity.textHighlights ? JSON.stringify(context.activity.textHighlights) : '없음'}`);
            console.log(`텍스트 포맷: '${context.activity.textFormat}'`);

            const text = context.activity.text;
            //console.log(`원본 메시지: '${text}'`);

            const removedMentionText = TurnContext.removeRecipientMention(context.activity);
            const cleanText = removedMentionText ? removedMentionText.trim() : text;
            //console.log(`정제 메시지: '${cleanText}'`);
            
            if (cleanText.includes(botMessageSignature)) {
                // 봇메세지는 무시한다.
                console.log('봇메세지이므로 무시합니다.');
            } else if (processTriggerKeywords.some(keyword => cleanText.includes(keyword))) {
                // 메시지 안에 프로세스 트리거 키워드가 존재하면 이미 실행중인 프로세스가 있는지 먼저 확인한 후 프로세스를 실행한다.
                (async () => {
                    const message = MessageFactory.text(`${botMessageSignature} 이미 실행중인 프로세스가 있는지 먼저 확인하겠습니다...`);
                    message.textFormat = 'plain'; // plain, markdown, xml
                    await context.sendActivity(message);
                })();

                const chatId = `19:${context.activity.from.aadObjectId}_${context.adapter.settings.appId}@unq.gbl.spaces`;
                UIPATH.runProcess(
                    this.token,
                    {
                        'g_chat_id': chatId,
                        'g_polling_sec': polling_sec
                    }
                );
            } else {
                // 메시지 큐에 메시지 추가
                MSGQUEUE.msgQueue.enqueue(cleanText);
            }

            await next();
        });

        // 멤버 추가 핸들러 (봇이 팀에 추가될 때)
        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            for (let member of membersAdded) {
                if (member.id !== context.activity.recipient.id) {
                    await context.sendActivity('안녕하세요! 저는 업무처리 봇입니다.');
                }
            }
            await next();
        });

        // 채널에서의 대화 업데이트 핸들러
        this.onTeamsChannelCreated(async (channelInfo, teamInfo, context, next) => {
            console.log(`새 채널 생성: ${channelInfo.name}`);
            await next();
        });
    }
}

// Teams Bot 인스턴스 생성
const bot = new TeamsBot();

// Teams Bot REST 서버 생성
const teamsBotServer = restify.createServer();
teamsBotServer.use(restify.plugins.bodyParser());

// Teams Bot 시작
teamsBotServer.listen(botPort, () => {
    (async () => {
        bot.token = await UIPATH.getAccessToken();

        if (bot.token) {
            console.log('\nUiPath와의 통신 준비 완료.\n');
        } else {
            throw new Error('\nUiPath 인증 실패로 인해 봇을 시작할 수 없습니다.');
        }
    })();

    console.log(`\nBot ID: ${botId}`);
    console.log(`Bot Password: ${botPassword.substring(0, 8)}...`);
    console.log(`Tenant ID: ${botTenantId}`);

    console.log(`\nTeams Bot listening to ${teamsBotServer.url}`);
    console.log('Bot 시작됨. Teams에서 메시지를 보내보세요.\n');
});

// Teams Bot 헬스체크 엔드포인트
teamsBotServer.get('/', async (req, res) => {
    res.send('Teams Bot이 실행 중입니다.');
});

// Teams Bot 메시지 엔드포인트
teamsBotServer.post('/api/messages', async (req, res) => {
    await adapter.process(req, res, (context) => bot.run(context));
});

// Teams Bot 메시지 전송 엔드포인트 (특정 사용자)
teamsBotServer.post('/api/sendMessage', async (req, res) => {
    const { userId, message } = req.body;

    if (!userId || !message) {
        res.status(400);
        res.send('userId와 message 필드가 필요합니다.');
        return;
    }

    await createConversationAndSendMessage(userId, message);
    res.send(`사용자 ${userId}에게 메시지를 보냈습니다.`);
});

// Teams Bot 메시지 전송 엔드포인트 (현재 대화중인 사용자)
teamsBotServer.post('/api/sendMessageToCurrentUser', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        console.log('message 필드가 없습니다.');
        res.status(400);
        res.send('message 필드가 필요합니다.');
        return;
    }

    console.log(`현재 대화중인 사용자에게 메시지 전송: '${message}'`);
    await sendMessageToCurrentUser(bot.conversationReference, message);
    res.send('현재 대화중인 사용자에게 메시지를 보냈습니다.');
});
