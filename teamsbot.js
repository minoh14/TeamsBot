//------------------------------------------------
// teamsbot.js
//------------------------------------------------

// 모듈 불러오기
const UIPATH = require('./uipath');
const MSGQUEUE = require('./msgqueue');

// 필요한 패키지: npm install botbuilder restify dotenv
require('dotenv').config();
const restify = require('restify');
const { BotFrameworkAdapter, TeamsActivityHandler, TurnContext } = require('botbuilder');

// 환경 변수 (.env 파일에서 관리)
const botId = process.env.MicrosoftAppId || '';
const botPassword = process.env.MicrosoftAppPassword || '';
const botTenantId = process.env.MicrosoftAppTenantId || '';
const botPort = process.env.MicrosoftAppPort || 3978;

// UiPath 인증 토큰 저장 변수
let token;

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

// Teams Bot 클래스
class TeamsBot extends TeamsActivityHandler {
    constructor() {
        super();

        // 메시지 수신 핸들러
        this.onMessage(async (context, next) => {
            const text = context.activity.text;
            const removedMentionText = TurnContext.removeRecipientMention(context.activity);
            const cleanText = removedMentionText ? removedMentionText.trim() : text;

            console.log(`받은 메시지: ${cleanText}`);
            
            if (cleanText.startsWith('(봇메세지)')) {
                // 봇메세지는 무시한다.
                console.log('봇메세지이므로 무시합니다.');
            } else if (cleanText.includes('거래선')) {
                // 프로세스 시작 메시지가 있으면 프로세스를 실행한다.
                //await context.sendActivity('(봇메세지)회계거래선을 신규로 추가하는 프로세스를 시작합니다...');
                //await context.sendActivity('(봇메세지)현재 실행중인 프로세스가 있는지 먼저 확인하겠습니다...');
                const chatId = `19:${context.activity.from.aadObjectId}_${context.adapter.settings.appId}@unq.gbl.spaces`;
                UIPATH.runProcess(
                    token,
                    {
                        'g_chat_id': chatId,
                        'g_polling_sec': 3
                    }
                );
            } else {
                //await context.sendActivity(`Echo: ${cleanText}`);
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
        token = await UIPATH.getAccessToken();

        if (token) {
            console.log('\nUiPath와의 통신 준비 완료.\n');
        } else {
            throw new Error('\nUiPath 인증 실패로 인해 봇을 시작할 수 없습니다.');
        }
    })();

    console.log(`\nBot ID: ${botId}`);
    console.log(`Bot Password: ${botPassword}`);
    console.log(`Tenant ID: ${botTenantId}`);

    console.log(`\n${teamsBotServer.name} listening to ${teamsBotServer.url}`);
    console.log('Bot 시작됨. Teams에서 메시지를 보내보세요.\n');
});

// Teams Bot 메시지 엔드포인트
teamsBotServer.post('/api/messages', async (req, res) => {
    await adapter.process(req, res, (context) => bot.run(context));
});

// Teams Bot 헬스체크 엔드포인트
teamsBotServer.get('/', async (req, res) => {
    res.send('Teams Bot이 실행 중입니다.');
});
