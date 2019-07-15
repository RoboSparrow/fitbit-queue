/* eslint-disable camelcase */
const path = require('path');
const fetch = require('node-fetch');

require('./config');
const log = require('./log');
const queue = require('./queue');
const jsonfs = require('./json-fs');
const { serializeUriParams, sleep } = require('./utils');

const {
    APP_FITBIT_CLIENTID,
    APP_FITBIT_CLIENTSECRET,
    APP_FITBIT_REDIRECTURI,
    APP_SESSION_DIR,
} = process.env;
const API = 'fitbit';

const SESSION_DIR_PATH = path.resolve(APP_SESSION_DIR);
const SLEEPLIST_API_DAY_PERIOD = 100; // days back to fetch
const SLEEPLIST_API_LIMIT = 100;

const yyyymmdd = function(date) {
    const yyyy = date.getFullYear();

    let mm = date.getMonth() + 1;
    mm = (mm < 10) ? '0' + mm : '' + mm;

    let dd = date.getDate();
    dd = (dd < 10) ? '0' + dd : '' + dd;

    return `${yyyy}-${mm}-${dd}`;
};

/**
 * fetch data,
 * store data
 * check if next
 * recall or resolve
 */
const getSleepList = function(session_id, access_token, yyyyMMdd, next_uri = '', files_written = []) {
    const limit = SLEEPLIST_API_LIMIT;
    const sessionDir = `${SESSION_DIR_PATH}/${session_id}`;

    // offest param not supported but required!
    // @see https://dev.fitbit.com/build/reference/web-api/sleep/#get-sleep-logs-list
    const uri = next_uri || `https://api.fitbit.com/1.2/user/-/sleep/list.json?beforeDate=${yyyyMMdd}&sort=desc&offset=0&limit=${limit}`;
    const count = files_written.length;
    const targetFile = `${sessionDir}/sleeplist.${count}.json`;

    log.debug(`[${session_id}] getSleepList(${count}): ${uri}`);

    return fetch(uri, {
        headers: {
            Authorization: `Bearer ${access_token}`
        }
    })
    .then((response) => {
        if (response.status === 429) {

            const retryAfter = response.headers.get('Retry-After');
            log.warn(`getSleepList():${session_id} getSleepList(), rate limit exceeded!, Retry-After: ${retryAfter}`);

            let wait = parseInt(retryAfter, 10);
            if (Number.isNaN(wait) || !wait) {
                wait = 3600;
            }
            wait += 10; // add margin
            log.debug(`getSleepList():${session_id} sleeping for ${wait} seconds`);

            return sleep(wait)
            .then(() => getSleepList(session_id, access_token, yyyyMMdd, next_uri, files_written));
        }
        // if > 300
        return response.json();
    })
    .then((data) => {
        return jsonfs.save(targetFile, data);
    })
    .then((data) => {
        files_written.push(targetFile);

        const pagination = data.pagination || {};
        const next = pagination.next || '';
        if (next) {
            return getSleepList(session_id, access_token, yyyyMMdd, next, files_written);
        }

        return files_written;
    });
};

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
    });
};

const runSleepTask = function(taskFile, api) {
    let sessionId = '<unknown>';
    let lockedFile;

    return queue.lock(taskFile)
    .then((locked) => {
        log.debug(`${api} locked file ${taskFile}`);
        lockedFile = locked;
        return queue.read(locked);
    })
    .then((data) => {
        log.debug(`${api} read file ${taskFile}`);
        const { refresh_token, session_id } = data;
        sessionId = session_id;
        return refreshToken(refresh_token);
    })
    .then((refreshedData) => {
        log.debug(`${api}:${sessionId}: refreshed access_token`);
        return queue.update(lockedFile, refreshedData);
    })
    .then((data) => {
        log.debug(`${api}:${sessionId}: start fetching sleep data`);
        const { session_id, access_token } = data;
        const date = new Date();
        date.setDate(date.getDate() - SLEEPLIST_API_DAY_PERIOD);
        const yyyyMMdd = yyyymmdd(date);
        return getSleepList(session_id, access_token, yyyyMMdd);
    })
    .then((files) => {
        log.debug(`${api}:${sessionId}: finished with ${files.length} requests to sleep api`);
        return queue.update(lockedFile, {
            files_created: files,
            status: 'success',
        });
    })
    //.then((data) => {
    //    log.info(JSON.stringify(data, null, 4));
    //    log.warn('DEV mode: Unlocking file for endless loop!!!');
    //    return queue.unlock(lockedFile);
    //})
    .then((data) => {
        task = data;
        log.info(JSON.stringify(data, null, 4));
        return queue.release(lockedFile);
    })
    .then((releasedFile) => {
        log.debug(`${api}:${sessionId}: released ${lockedFile}`);
        return queue.remove(releasedFile);
    })
    .then(() => {
        log.info(`${api}:${sessionId}: FINISHED: removed from queue`);
        return true;
    })
    .catch((err) => {
        log.error(`${api}:${sessionId}: EXIT ${lockedFile} with error`);
        log.error(err);
        throw new Error(`${api}:${sessionId}) exiting task...`);
    });
};

const next = function() {
    return queue.findNextTask(API)
    .then((taskFile) => {
        if (!taskFile) {
            log.debug(`${API} next(), no task file found.`);
            return sleep(1000)
            .then(() => next());
        }

        return runSleepTask(taskFile, API)
        .then(() => sleep(1000))
        .then(() => next());
    })
    .catch((err) => {
        log.error('Error findNextTask(), running next()');
        log.error(err);
        return sleep(1000)
        .then(() => next());
    });
};

queue.init(API)
.then(() => next())
.catch((err) => {
    log.error(`Failed to initialize queue for ${API}, error: ${err.toString()}`);
    log.error(err);
});
