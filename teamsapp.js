//------------------------------------------------
// teamsapp.js
//------------------------------------------------

// 모듈 불러오기
const UIPATH = require('./uipath');
const MSGQUEUE = require('./msgqueue');

// 필요한 패키지: npm install botbuilder restify dotenv @microsoft/microsoft-graph-client
require('dotenv').config();
const restify = require('restify');
const {
    CloudAdapter,
    ConfigurationServiceClientCredentialFactory,
    TeamsActivityHandler,
    TurnContext,
    MessageFactory,
    ConfigurationBotFrameworkAuthentication,
    ActivityTypes
} = require('botbuilder');
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
const { ConnectorClient, MicrosoftAppCredentials } = require('botframework-connector');
const crypto = require('crypto');
const fs = require('fs');

// 환경 변수 (.env 파일에서 관리)
const teamsAppApiKey = process.env.TeamsAppApiKey || '';
const appId = process.env.MicrosoftAppId || '';
const appPassword = process.env.MicrosoftAppPassword || '';
const appType = process.env.MicrosoftAppType || 'SingleTenant';
const appTenantId = process.env.MicrosoftAppTenantId || '';
const appPort = process.env.MicrosoftAppPort || 3978;
const pollingSec = process.env.PollingIntervalSeconds || 3;
const processTriggerKeywords = (process.env.ProcessTriggerKeywords || '거래처,거래선').split(',');
const textFormat = process.env.TextFormat || 'markdown';
const requiredRuntimes = process.env.RequiredRuntimes || 0;
const taskOwnerIds = process.env.TaskOwnerIds ? process.env.TaskOwnerIds.split(' ') : [];
const appMessage1 = process.env.AppMessage1 || '';
const appMessage2 = process.env.AppMessage2 || '';
const appMessage3 = process.env.AppMessage3 || '';

// API Key Authentication
const apiKeyAuth = (req, res, next) => {
    const clientKey = req.headers['x-api-key'];

    if (!clientKey) {
        console.error('TA API Key missing in HTTP request header!');
        return res.send(403, { error: '권한이 없습니다.' });
    }

    // 보안 강화: 타임 상수 비교
    try {
        const isMatch = crypto.timingSafeEqual(
            Buffer.from(clientKey),
            Buffer.from(teamsAppApiKey)
        );

        if (isMatch) {
            //console.log('TA API key identical');
            next();
        } else {
            console.error('TA API Key NOT identical!');
            res.send(403, { error: '권한이 없습니다.' });
        }
    } catch (e) {
        console.error('TA API Key NOT same length!');
        res.send(403, { error: '권한이 없습니다.' });
    }
};

// Create adapter
const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: appId,
    MicrosoftAppPassword: appPassword,
    MicrosoftAppType: appType,
    MicrosoftAppTenantId: appTenantId,
    MicrosoftAppPort: appPort
});

const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({}, credentialsFactory);
const adapter = new CloudAdapter(botFrameworkAuthentication);

// Error handler
adapter.onTurnError = async (context, error) => {
    console.error(`\n[onTurnError] ${error}`);
    await context.sendActivity(appMessage1);
};

// Teams App Class
class TeamsApp extends TeamsActivityHandler {
    constructor() {
        super();

        this.uipathToken = null; // UiPath 인증 토큰 (JSON 객체)
        this.conversationReference = this.loadConversationReference();

        // 메시지 수신 핸들러
        this.onMessage(async (context, next) => {
            
            // 대화 참조 정보 저장
            this.conversationReference = TurnContext.getConversationReference(context.activity);
            this.saveConversationReference();
            //console.log(`AAD Object ID: '${context.activity.from.aadObjectId}'`);

            // Get user info
            //const userInfo = await this.getUserInfo(context);
            //console.log(`id: ${userInfo.id}`);
            //console.log(`name: ${userInfo.name}`);
            //console.log(`email: ${userInfo.email}`);
            //console.log(`department: ${userInfo.department}`);
            //console.log(`job title: ${userInfo.jobTitle}`);
            //console.log(`office location: ${userInfo.officeLocation}`);

            const text = context.activity.text;
            console.log(`[${new Date().toLocaleString()}] 원본 메시지: '${text}'`);

            const removedMentionText = TurnContext.removeRecipientMention(context.activity);
            const cleanText = removedMentionText ? removedMentionText.trim() : text;
            //console.log(`정제 메시지: '${cleanText}'`);
            
            // 메시지 큐에 메시지 추가
            //MSGQUEUE.msgQueue.enqueue(userInfo.id, cleanText);

            await next();
        });

        // 멤버 추가 핸들러 (앱이 팀에 추가될 때)
        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            for (let member of membersAdded) {
                if (member.id !== context.activity.recipient.id) {
                    await context.sendActivity(appMessage3);
                }
            }
            await next();
        });

        // 채널에서의 대화 업데이트 핸들러
        this.onTeamsChannelCreated(async (channelInfo, teamInfo, context, next) => {
            console.log(`[${new Date().toLocaleString()}] 새 채널 생성: ${channelInfo.name}`);
            await next();
        });
    }

    loadConversationReference() {
        try {
            const data = fs.readFileSync('conversationReference.json', 'utf8');
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    saveConversationReference() {
        fs.writeFileSync('conversationReference.json', JSON.stringify(this.conversationReference, null, 2));
    }

    // Get OAuth token for Microsoft Graph API
    async getGraphToken() {
        const credential = new ClientSecretCredential(
            appTenantId,
            appId,
            appPassword
        );

        try {
            const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default');
            //console.log('Graph token:', tokenResponse.token);
            //console.log('Token expires on:', tokenResponse.expiresOnTimestamp);

            return tokenResponse.token;
        } catch (error) {
            console.error(`[${new Date().toLocaleString()}] Graph 토큰을 가져오는 중 오류 발생: ${error.message}`);
            throw error;
        }
    }

    // Get user info
    async getUserInfo(context) {

        const token = await this.getGraphToken();

        const client = Client.init({
            authProvider: (done) => {
                done(null, token);
            }
        });

        const user = await client
            .api(`/users/${context.activity.from.aadObjectId}`)
            .select('id,displayName,mail,userPrincipalName,department,jobTitle,officeLocation')
            .get();
        
        return {
            id: user.id,
            name: user.displayName,
            email: user.mail || user.userPrincipalName,
            //department: user.department,
            //jobTitle: user.jobTitle,
            //officeLocation: user.officeLocation
        };
    }

    // Send message to the current user in conversation
    async sendMessageToCurrentUser(text) {
        if (!this.conversationReference) {
            console.error(`[${new Date().toLocaleString()}] 대화 참조 정보(conversationReference)가 아직 초기화되지 않았습니다. 메시지를 보낼 수 없습니다.`);
            return;
        }

        //console.log(`text: '${text}'`);

        const message = MessageFactory.text(text);
        message.textFormat = textFormat;

        await adapter.continueConversationAsync(
            appId,
            this.conversationReference,
            async (context) => {
                await context.sendActivity(message);
            }
        );
    }

    async createConversationAndContinue(userId, callback) {
        const appCredentials = new MicrosoftAppCredentials(
            appId,
            appPassword,
            appTenantId
        );

        const connectorClient = new ConnectorClient(appCredentials, { baseUri: this.conversationReference.serviceUrl });

        const conversationParameters = {
            isGroup: false,
            tenantId: appTenantId,
            bot: {
                id: this.conversationReference.bot.id,
                name: this.conversationReference.bot.name
            },
            members: [
                {
                    id: userId
                }
            ]
        };

        const response = await connectorClient.conversations.createConversation(conversationParameters);

        const convRef = {
            activityId: response.activityId,
            channelId: 'msteams',
            serviceUrl: this.conversationReference.serviceUrl,
            conversation: {
                id: response.id,
                tenantId: appTenantId,
                conversationType: 'personal'
            },
            bot: {
                id: this.conversationReference.bot.id,
                name: this.conversationReference.bot.name
            },
            user: {
                id: userId
            }
        };

        await adapter.continueConversationAsync(appId, convRef, callback);
    }

    // Send message to a specific user
    async createConversationAndSendMessage(userId, text) {
        try {
            await this.createConversationAndContinue(userId, async (context) => {
                const message = MessageFactory.text(text);
                message.textFormat = textFormat;
                await context.sendActivity(message);
            });
            console.log(`[${new Date().toLocaleString()}] 사용자 '${userId}'에게 메시지 전송 완료:\n${text}`);
        } catch (error) {
            console.error(`[${new Date().toLocaleString()}] 사용자 '${userId}'에게 메시지 전송 중 오류 발생: ${error}`);
        }
    }

    // Send typing indicator to a specific user
    async createConversationAndSendTypingIndicator(userId) {
        try {
            await this.createConversationAndContinue(userId, async (context) => {
                await context.sendActivity({ type: ActivityTypes.Typing });
            });
            console.log(`[${new Date().toLocaleString()}] 사용자 '${userId}'에게 typing indicator 전송 완료.`);
        } catch (error) {
            console.error(`[${new Date().toLocaleString()}] 사용자 '${userId}'에게 typing indicator 전송 중 오류 발생: ${error}`);
        }
    }
}

// Teams App 인스턴스 생성
const app = new TeamsApp();

// Teams App REST 서버 생성
const serverOptions = {
    certificate: fs.readFileSync('cert.pem'),
    key: fs.readFileSync('key.pem')
};
//const teamsAppServer = restify.createServer();  // HTTP 서버
const teamsAppServer = restify.createServer(serverOptions);  // HTTPS 서버
teamsAppServer.use(restify.plugins.bodyParser());

function triggerUipathTokenRenewal() {
    setInterval(
        async () => {
            const newToken = await UIPATH.getAccessToken();
            if (newToken) {
                app.uipathToken = newToken;
                console.log(`[${new Date().toLocaleString()}] ✅ UiPath 인증 토큰 갱신 성공.\n`);
            } else {
                console.error(`[${new Date().toLocaleString()}] ❌ UiPath 인증 토큰 갱신 실패.\n`);
            }
        },
        (app.uipathToken.expiry - 60) * 1000 // 만료 1분 전에 갱신 시도
    );
}

// Start Teams App REST server
teamsAppServer.listen(appPort, () => {
    (async () => {
        app.uipathToken = await UIPATH.getAccessToken();

        if (app.uipathToken) {
            console.log(`\n[${new Date().toLocaleString()}] UiPath와의 통신 준비 완료.\n`);
            triggerUipathTokenRenewal();
        } else {
            throw new Error(`\n[${new Date().toLocaleString()}] UiPath 인증 실패로 인해 에이전트를 시작할 수 없습니다.`);
        }
    })();

    console.log(`\nApp ID: ${appId}`);
    console.log(`App Password: ${appPassword.substring(0, 8)}...`);
    console.log(`Tenant ID: ${appTenantId}`);

    console.log(`\nTeams App listening to ${teamsAppServer.url}`);
});

// Teams App 헬스체크 엔드포인트
teamsAppServer.get('/', async (req, res) => {
    res.send('에이전트가 실행 중입니다.');
});

// Listen to incoming requests
teamsAppServer.post('/api/messages', async (req, res) => {
    /*
    console.log(`X-Forwarded-For: ${req.headers['x-forwarded-for']}`);
    console.log(`Remote Address : ${req.socket.remoteAddress}`);
    const remoteAddress = ((req.headers['x-forwarded-for'] || req.socket.remoteAddress) ?? '').split(',')[0].trim();
    console.log(`remote address: ${remoteAddress}`);
    if (!allowedCidrs.some(cidr => ipInCidr(remoteAddress, cidr))) {
        console.error(`허용되지 않은 IP: ${remoteAddress}`);
        res.send(403, { error: '허용되지 않은 IP 주소입니다.' });
        return;
    }
    */
    console.log(`\n[${new Date().toLocaleString()}] Teams App 메시지 수신됨.`);
    await adapter.process(req, res, (context) => app.run(context));
});

// Teams App 메시지 전송 엔드포인트 (특정 사용자)
teamsAppServer.post('/api/sendMessage', apiKeyAuth, async (req, res) => {
    /*
    console.log(`X-Forwarded-For: ${req.headers['x-forwarded-for']}`);
    console.log(`Remote Address : ${req.socket.remoteAddress}`);
    const remoteAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`remote address: ${remoteAddress}`);
    */
    const { userId, message } = req.body;

    if (!userId || !message) {
        console.log(`[${new Date().toLocaleString()}] userId와 message 필드가 필요합니다.`);
        res.send(400, 'userId와 message 필드가 필요합니다.');
        return;
    }

    try {
        await app.createConversationAndSendMessage(userId, message);
        res.send(`사용자 ${userId}에게 메시지를 보냈습니다.`);
    } catch (err) {
        console.error(`[${new Date().toLocaleString()}] 엔드포인트 에러:`, err);
        res.send(500, '오류 발생');
    }
});

teamsAppServer.post('/api/sendTypingIndicator', apiKeyAuth, async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        console.log(`[${new Date().toLocaleString()}] userId 필드가 필요합니다.`);
        res.send(400, 'userId 필드가 필요합니다.');
        return;
    }

    try {
        await app.createConversationAndSendTypingIndicator(userId);
        res.send(`사용자 ${userId}에게 typing indicator를 보냈습니다.`);
    } catch (err) {
        console.error(`[${new Date().toLocaleString()}] 엔드포인트 에러:`, err);
        res.send(500, '오류 발생');
    }
});
