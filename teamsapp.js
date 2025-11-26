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
    ConfigurationBotFrameworkAuthentication
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
const taskOwnerId = process.env.TaskOwnerId || '';
const appMessage1 = process.env.AppMessage1 || '';
const appMessage2 = process.env.AppMessage2 || '';
const appMessage3 = process.env.AppMessage3 || '';

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
    await context.sendActivity(`거래선 관리 Agent에서 오류가 발생했습니다.<br>
다음에 시도해주시기 바랍니다.`);
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
            //console.log(`AAD Object ID: '${context.activity.from.aadObjectId}'`);

            // Get user info
            this.userInfo = await this.getUserInfo(context);
            //console.log(`id: ${this.userInfo.id}`);
            //console.log(`name: ${this.userInfo.name}`);
            //console.log(`email: ${this.userInfo.email}`);
            //console.log(`department: ${this.userInfo.department}`);
            //console.log(`job title: ${this.userInfo.jobTitle}`);
            //console.log(`office location: ${this.userInfo.officeLocation}`);

            const text = context.activity.text;
            console.log(`원본 메시지: '${text}'`);

            const removedMentionText = TurnContext.removeRecipientMention(context.activity);
            const cleanText = removedMentionText ? removedMentionText.trim() : text;
            //console.log(`정제 메시지: '${cleanText}'`);
            
            if (processTriggerKeywords.some(keyword => cleanText.includes(keyword))) {
                // 메시지 안에 프로세스 트리거 키워드가 존재하면 프로세스를 실행한다.

                await this.sendMessageToCurrentUser(`이전에 요청하신 거래선 등록 작업이 진행중인지 확인중입니다.<br>
진행중인 작업이 없다면 신규 등록을 지원해 드리겠습니다.<br>
잠시만 기다려주세요.`);

                UIPATH.runProcess(
                    this.token,
                    {
                        "g_polling_sec": polling_sec,
                        "g_task_owner_id": taskOwnerId, // 자금팀 업무 담당자
                        "g_user_info": {
                            id: this.userInfo.id,
                            name: this.userInfo.name,
                            email: this.userInfo.email,
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
                    await context.sendActivity(`안녕하세요. 저는 거래선 관리 Agent입니다.<br>
무엇을 도와드릴까요?`);
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
            //console.log('Token expires on:', tokenResponse.expiresOnTimestamp);

            return tokenResponse.token;
        } catch (error) {
            console.error('Graph 토큰을 가져오는 중 오류 발생:', error.message);
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
        
        /*
        return {
            id: context.activity.from.id,
            name: context.activity.from.name
        };
        */
    }

    // Send message to the current user in conversation
    async sendMessageToCurrentUser(text) {
        if (!this.conversationReference) {
            console.error('사용자와의 대화 참조 정보가 없습니다.');
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

    // Create conversation and send message to a specific user
    async createConversationAndSendMessage(context, userId, text) {
        try {
            //console.log(`conversationReference.bot.id: '${this.conversationReference.bot.id}'`);
            //console.log(`conversationReference.bot.name: '${this.conversationReference.bot.name}'`);
            //console.log(`conversationReference.serviceUrl: '${this.conversationReference.serviceUrl}'`);

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

            await adapter.continueConversationAsync(
                appId,
                convRef,
                async (context) => {
                    const message = MessageFactory.text(text);
                    message.textFormat = textFormat;

                    await context.sendActivity(message);
                }
            );

            console.log(`사용자 '${userId}'에게 메시지 전송 완료.`);

        } catch (error) {
            console.error(`사용자 '${userId}'에게 메시지 전송 중 오류 발생: ${error}`);
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
