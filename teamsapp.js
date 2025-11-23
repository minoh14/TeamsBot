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
    createBotFrameworkAuthenticationFromConfiguration,
    TeamsActivityHandler,
    TurnContext,
    MessageFactory,
    TeamsInfo
} = require('botbuilder');
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
const { ConnectorClient, MicrosoftAppCredentials } = require('botframework-connector');

// 환경 변수 (.env 파일에서 관리)
const appId = process.env.MicrosoftAppId || '';
const appPassword = process.env.MicrosoftAppPassword || '';
const appType = process.env.MicrosoftAppType || 'SingleTenant';
const appTenantId = process.env.MicrosoftAppTenantId || '';
const appPort = process.env.MicrosoftAppPort || 3978;
const polling_sec = process.env.PollingIntervalSeconds || 3;
const processTriggerKeywords = (process.env.ProcessTriggerKeywords || '거래처,거래선').split(',');
const textFormat = process.env.TextFormat || 'markdown';

// Create adapter
const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: appId,
    MicrosoftAppPassword: appPassword,
    MicrosoftAppType: appType,
    MicrosoftAppTenantId: appTenantId,
    MicrosoftAppPort: appPort
});

const botFrameworkAuthentication = createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);
const adapter = new CloudAdapter(botFrameworkAuthentication);

// Error handler
adapter.onTurnError = async (context, error) => {
    console.error(`\n[onTurnError] ${error}`);
    await context.sendActivity('앱에서 에러가 발생했습니다.');
};

// Teams App Class
class TeamsApp extends TeamsActivityHandler {
    constructor() {
        super();

        this.token = null; // UiPath 인증 토큰
        this.conversationReference = null; // 대화 참조 정보
        this.userInfo = null; // 대화중인 사용자 정보

        // 메시지 수신 핸들러
        this.onMessage(async (context, next) => {

            // 대화 참조 정보 저장
            this.conversationReference = TurnContext.getConversationReference(context.activity);
            console.log(`service url: ${this.conversationReference.serviceUrl}`);

            // Get user info
            this.userInfo = await this.getUserInfo(context);
            console.log(`id: ${this.userInfo.id}`);
            console.log(`name: ${this.userInfo.name}`);
            //console.log(`email: ${this.userInfo.email}`);
            //console.log(`department: ${this.userInfo.department}`);
            //console.log(`job title: ${this.userInfo.jobTitle}`);
            //console.log(`office location: ${this.userInfo.officeLocation}`);

            const text = context.activity.text;
            console.log(`원본 메시지: '${text}'`);

            const removedMentionText = TurnContext.removeRecipientMention(context.activity);
            const cleanText = removedMentionText ? removedMentionText.trim() : text;
            console.log(`정제 메시지: '${cleanText}'`);
            
            if (processTriggerKeywords.some(keyword => cleanText.includes(keyword))) {
                // 메시지 안에 프로세스 트리거 키워드가 존재하면 이미 실행중인 프로세스가 있는지 먼저 확인한 후 프로세스를 실행한다.
                await this.sendMessageToCurrentUser('_이미 실행중인 프로세스가 있는지 먼저 확인하겠습니다..._');

                UIPATH.runProcess(
                    this.token,
                    {
                        "g_polling_sec": polling_sec,
                        "g_user_info": {
                            id: this.userInfo.id,
                            name: this.userInfo.name,
                            //email: this.userInfo.email,
                            //department: this.userInfo.department,
                            //jobTitle: this.userInfo.jobTitle,
                            //officeLocation: this.userInfo.officeLocation
                        }
                    }
                );
            } else {
                // 메시지 큐에 메시지 추가
                MSGQUEUE.msgQueue.enqueue(cleanText);
            }

            await next();
        });

        // 멤버 추가 핸들러 (앱이 팀에 추가될 때)
        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            for (let member of membersAdded) {
                if (member.id !== context.activity.recipient.id) {
                    await context.sendActivity('안녕하세요! 저는 거래선 관리 에이전트입니다.');
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
            console.log('Token expires on:', tokenResponse.expiresOnTimestamp);

            return tokenResponse.token;
        } catch (error) {
            console.error('Graph 토큰을 가져오는 중 오류 발생:', error.message);
            throw error;
        }
    }

    // Get user info
    async getUserInfo(context) {
        /*--- Application permission required: User.Read.All ---

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
            department: user.department,
            jobTitle: user.jobTitle,
            officeLocation: user.officeLocation
        };
        */
        
        return {
            id: context.activity.from.id,
            name: context.activity.from.name
        };
    }

    // Send message to the current user in conversation
    async sendMessageToCurrentUser(text) {
        if (!this.conversationReference) {
            console.error('사용자와의 대화 참조 정보가 없습니다.');
            return;
        }

        console.log(`text: '${text}'`);

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

    // Create conversation and send message to a specific user
    async createConversationAndSendMessage(userId, text) {
        const conversationReference = {
            bot: { id: appId },
            user: { id: userId },
            serviceUrl: this.conversationReference.serviceUrl,
            conversation: {
                isGroup: false,
                conversationType: 'personal',
                tenantId: appTenantId,
                id: userId
            }
        };

        try {
            await adapter.continueConversationAsync(
                appId,
                conversationReference,
                async (context) => {
                    const conversationParameters = {
                        isGroup: false,
                        channelData: { tenant: { id: appTenantId } },
                        members: [{ id: userId }]
                    };

                    const credentials = new MicrosoftAppCredentials(appId, appPassword);
                    const connectorClient = new ConnectorClient(credentials, { baseUri: conversationReference.serviceUrl });

                    try {
                        const conversationResponse = await connectorClient.conversations.createConversation(conversationParameters);
                        const newConversationReference = {
                            ...conversationReference,
                            conversation: {
                                id: conversationResponse.id,
                                tenantId: appTenantId
                            }
                        };

                        const message = MessageFactory.text(text);
                        message.textFormat = textFormat;

                        await adapter.continueConversationAsync(
                            appId,
                            newConversationReference,
                            async (newContext) => { await newContext.sendActivity(message); }
                        );
                    } catch (createError) {
                        // If conversation already exists, send message directly
                        console.log('Conversation already exists. Send message directly:', createError.message);

                        const message = MessageFactory.text(text);
                        message.textFormat = textFormat;
                        
                        await context.sendActivity(message);
                    }
                }
            );
        } catch (error) {
            console.error('메시지 전송 중 오류 발생:', error.message);
        }
    }
}

// Teams App 인스턴스 생성
const app = new TeamsApp();

// Teams App REST 서버 생성
const teamsAppServer = restify.createServer();
teamsAppServer.use(restify.plugins.bodyParser());

// Start Teams App REST server
teamsAppServer.listen(appPort, () => {
    (async () => {
        app.token = await UIPATH.getAccessToken();

        if (app.token) {
            console.log('\nUiPath와의 통신 준비 완료.\n');
        } else {
            throw new Error('\nUiPath 인증 실패로 인해 에이전트를 시작할 수 없습니다.');
        }
    })();

    console.log(`\nApp ID: ${appId}`);
    console.log(`App Password: ${appPassword.substring(0, 8)}...`);
    console.log(`Tenant ID: ${appTenantId}`);

    console.log(`\nTeams App listening to ${teamsAppServer.url}`);
    console.log('에이전트가 시작됨. Teams에서 메시지를 보내보세요.\n');
});

// Teams App 헬스체크 엔드포인트
teamsAppServer.get('/', async (req, res) => {
    res.send('에이전트가 실행 중입니다.');
});

// Listen for incoming requests
teamsAppServer.post('/api/messages', async (req, res) => {
    await adapter.process(req, res, (context) => app.run(context));
});

// Teams App 메시지 전송 엔드포인트 (특정 사용자)
teamsAppServer.post('/api/sendMessage', async (req, res) => {
    const { userId, message } = req.body;

    if (!userId || !message) {
        res.status(400);
        res.send('userId와 message 필드가 필요합니다.');
        return;
    }

    await app.createConversationAndSendMessage(userId, message);
    res.send(`사용자 ${userId}에게 메시지를 보냈습니다.`);
});

// Teams App 메시지 전송 엔드포인트 (현재 대화중인 사용자)
teamsAppServer.post('/api/sendMessageToCurrentUser', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        console.log('message 필드가 없습니다.');
        res.status(400);
        res.send('message 필드가 필요합니다.');
        return;
    }

    await app.sendMessageToCurrentUser(message);
    res.send('현재 대화중인 사용자에게 메시지를 보냈습니다.');
});
