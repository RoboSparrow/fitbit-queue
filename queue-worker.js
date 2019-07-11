/* eslint-disable camelcase */

const fetch = require('node-fetch');

require('./config');
const log = require('./log');
const queue = require('./queue');
const { parseJwtToken, serializeUriParams } = require('./utils');

const args = process.argv.slice(2);
if (!args.length) {
    throw new Error('api argument reqired');
}

const API = args[0];

const {
    APP_FITBIT_CLIENTID,
    APP_FITBIT_CLIENTSECRET,
    APP_FITBIT_REDIRECTURI,
} = process.env;


/**
 * @see https://dev.fitbit.com/build/reference/web-api/oauth2/#refreshing-tokens
 */

const refreshToken = function(refresh_token) {
    const auth = Buffer.from(`${APP_FITBIT_CLIENTID}:${APP_FITBIT_CLIENTSECRET}`).toString('base64');

    const payload = {
        grant_type: 'refresh_token',
        refresh_token,
        redirect_uri: APP_FITBIT_REDIRECTURI,
        expires_in: 28800
    };

    return fetch('https://api.fitbit.com/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
        },

        body: serializeUriParams(payload),
    })
    .then(() => {
    });
};

const runSleepTask = function(taskFile, api) {
    let task;
    let lockedFile;

    queue.lock(taskFile)
    .then((locked) => {
        log.info(`${api} locked file ${taskFile}`);
        lockedFile = locked;
        return queue.read(locked);
    })
    .then((data) => {
        log.info(`${api}:${task._session_id}: locked file ${taskFile}`);
        const now = Math.floor(Date.now() / 1000) - 1800;
        task = data;
        const { access_token, refresh_token } = task;

        const jwt = parseJwtToken(access_token);
        // refresh token if required
        if (jwt.exp <= now) {
            log.warn(`${api}:${task._session_id}: access_token expired!`);
            return refreshToken(refresh_token)
            .then(refreshed => queue.update(lockedFile, refreshed))
            .then(() => queue.unlock(lockedFile))
            .then(() => {
                log.info(`${api}:${task._session_id}: refreshed access_token token`);
                log.info(`${api}:${task._session_id}: unlocked file and re-issued task to queue`);
                throw new Error(`${api}:${task._session_id}) exiting task...`);
            });
        }

        return false;
    })
    .then(() => {
        // fetch sleep data,
        // write to session
        // close session,
        // release task
        // remove task
    });
};

queue.init(API)
.then(() => queue.watch(API, runSleepTask))
.then(dir => log.info(`Started watching ${dir}`))
.catch((err) => {
    throw err;
});

process.on('message', ({ job, session_id, data }) => {
    switch (job) {

        case 'create':
            queue.create(API, session_id, data)
            .then(file => log.info(`created task: ${file}`))
            .catch(err => log.error(err.toString()));
            break;

        default:
            log.warn(`Unkown job ${job} (sessionId: ${session_id})`);

    }
});
