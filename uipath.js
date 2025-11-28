//------------------------------------------------
// orchestrator.js
//------------------------------------------------

// 필요한 패키지: npm install dotenv axios
const axios = require('axios');
const { URLSearchParams } = require('url'); // Node.js 내장 모듈

// load environment variables from .env file
require('dotenv').config();

// 환경 변수 (.env 파일에서 관리)
const uipathAppId = process.env.UiPathAppId || '';
const uipathAppSecret = process.env.UiPathAppSecret || '';
const uipathBaseURL = process.env.UiPathBaseURL || 'https://cloud.uipath.com';
const uipathOrganizationName = process.env.UiPathOrganizationName || '';
const uipathTenantName = process.env.UiPathTenantName || '';
const uipathFolderId = process.env.UiPathFolderId || '';
const uipathProcessName = process.env.UiPathProcessName || '';
//const uipathAuthScope = 'OR.Administration OR.Administration.Read OR.Administration.Write OR.Analytics OR.Analytics.Read OR.Analytics.Write OR.Assets OR.Assets.Read OR.Assets.Write OR.Audit OR.Audit.Read OR.Audit.Write OR.AutomationSolutions.Access OR.BackgroundTasks OR.BackgroundTasks.Read OR.BackgroundTasks.Write OR.Execution OR.Execution.Read OR.Execution.Write OR.Folders OR.Folders.Read OR.Folders.Write OR.Hypervisor OR.Hypervisor.Read OR.Hypervisor.Write OR.Jobs OR.Jobs.Read OR.Jobs.Write OR.License OR.License.Read OR.License.Write OR.Machines OR.Machines.Read OR.Machines.Write OR.ML OR.ML.Read OR.ML.Write OR.Monitoring OR.Monitoring.Read OR.Monitoring.Write OR.Queues OR.Queues.Read OR.Queues.Write OR.Robots OR.Robots.Read OR.Robots.Write OR.Settings OR.Settings.Read OR.Settings.Write OR.Tasks OR.Tasks.Read OR.Tasks.Write OR.TestDataQueues OR.TestDataQueues.Read OR.TestDataQueues.Write OR.TestSetExecutions OR.TestSetExecutions.Read OR.TestSetExecutions.Write OR.TestSets OR.TestSets.Read OR.TestSets.Write OR.TestSetSchedules OR.TestSetSchedules.Read OR.TestSetSchedules.Write OR.Users OR.Users.Read OR.Users.Write OR.Webhooks OR.Webhooks.Read OR.Webhooks.Write';
const uipathAuthScope = 'OR.Jobs.Write';

// UiPath 인증 토큰 가져오기 함수
async function getAccessToken() {

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', uipathAppId);
    params.append('client_secret', uipathAppSecret);
    params.append('scope', uipathAuthScope);

    const apiUrl = uipathBaseURL + '/identity_/connect/token';

    try {

        console.log('\nUiPath 인증 토큰 요청 중...');

        // URLSearchParams 객체를 data로 전달하면,
        // axios가 자동으로 'Content-Type': 'application/x-www-form-urlencoded' 헤더를 설정해준다.
        const response = await axios.post(apiUrl, params);

        const accessToken = response.data.access_token;
        const expiresIn = response.data.expires_in; // 만료 시간(초)
        const tokenType = response.data.token_type; // (e.g., "Bearer")

        console.log('✅ UiPath 인증 토큰 가져오기 성공:');
        console.log(`   - Token Type: ${tokenType}`);
        console.log(`   - Expires In: ${expiresIn} 초`);
        console.log(`   - Access Token: ${accessToken.substring(0, 20)}...`); // 보안을 위하여 토큰 일부만 출력

        return {
            token: accessToken,
            expiry: expiresIn
        };

    } catch (error) {

        console.error('❌ UiPath 인증 토큰 가져오기 실패:');

        if (error.response) {
            // 서버가 에러 응답을 반환한 경우 (e.g., 400, 401, 403)
            console.error(`   - Status: ${error.response.status}`);
            console.error(`   - Error: ${error.response.data.error}`);
            console.error(`   - Description: ${error.response.data.error_description}`);
        } else if (error.request) {
            // 요청이 전송되었으나 응답을 받지 못한 경우 (네트워크 오류 등)
            console.error('   - Error: No response received from UiPath Identity Server.');
        } else {
            // 요청 설정 중 오류가 발생한 경우
            console.error(`   - Error: ${error.message}`);
        }

        return null;
    }
}

// UiPath 프로세스 실행 함수
async function runProcess(token, inputArguments) {

    if (!token) {
        console.error('UiPath 인증 토큰이 없습니다. 프로세스를 실행할 수 없습니다.');
        return null;
    }

    const apiUrl = `https://cloud.uipath.com/${uipathOrganizationName}/${uipathTenantName}/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs`;

    const jobPayload = {
        startInfo: {
            'ReleaseName': uipathProcessName,
            'Strategy': 'JobsCount',
            'JobsCount': 1,
            'InputArguments': JSON.stringify(inputArguments)
        }
    };

    try {

        const response = await axios.post(apiUrl, jobPayload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-UIPATH-OrganizationUnitId': uipathFolderId
            }
        });

        console.log('✅ UiPath 프로세스 실행 성공.');
        console.log(`   - Status: ${response.status}`);
        console.log(`   - Job ID: ${response.data.value[0].Id}`);
        return response.data;

    } catch (error) {

        console.error('❌ UiPath 프로세스 실행 실패:');

        if (error.response) {
            // 서버가 에러 응답을 반환한 경우 (e.g., 400, 401, 403)
            console.error(`   - Status: ${error.response.status}`);
            console.error(`   - Data: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            // 요청이 전송되었으나 응답을 받지 못한 경우 (네트워크 오류 등)
            console.error('   - Error: No response received from UiPath API.');
        } else {
            // 요청 설정 중 오류가 발생한 경우
            console.error(`   - Error: ${error.message}`);
        }

        return null;
    }
}

module.exports = {
    getAccessToken,
    runProcess
};
