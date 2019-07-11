#!/usr/bin/env node

/* eslint-disable camelcase */

/**
 * https://dev.fitbit.com/build/reference/web-api/basics/
 * https://dev.fitbit.com/build/reference/web-api/sleep/
 * Rate Limits

 * > The Fitbit API has two separate rate limits on the number of calls an app can make. Both are hourly limits that reset at the start of the hour.
 * > The Client + Viewer Rate Limit
 * > You can make 150 API requests per hour for each user that has authorized your application to access their data. This rate limit is applied when you make an API request using the user's access token.
 * > The vast majority of your API calls should use the user's access token. As such, because these API requests are metered per user, your application will not be constrained as your user base grows.
 * > The Client Rate Limit
 * > Your application can make 150 API requests per hour without a user access token. These types of API requests are for retrieving non-user data, such as Fitbit's general resources (Browse Activities, Get Activity, Search Foods, Get Food, and Get Food Units).
 *
 *
 * Fitbit-Rate-Limit-Limit: The quota number of calls.
 * Fitbit-Rate-Limit-Remaining: The number of calls remaining before hitting the rate limit.
 * Fitbit-Rate-Limit-Reset: The number of seconds until the rate limit resets.
 *
 * https://api.fitbit.com/1.2/user/[user-id]/sleep/date/[startDate; yyyy-MM-dd]/[endDate: yyyy-MM-dd].json
 * https://aaronparecki.com/oauth-2-simplified/#web-server-apps
 */

const express = require('express');
const { fork } = require('child_process');
const fetch = require('node-fetch');

require('./config');
const log = require('./log');
const { serializeUriParams } = require('./utils');

////
/// bootstrap
////

const {
    APP_PORT,
    APP_FITBIT_CLIENTID,
    APP_FITBIT_CLIENTSECRET,
    APP_FITBIT_REDIRECTURI,
} = process.env;

const args = process.argv.slice(2);
let customPort = NaN;
if (args.length) {
    customPort = parseInt(args[0], 10);
}

const port = (!Number.isNaN(customPort) && customPort) ? customPort : APP_PORT;
const app = express();

////
// start queue worker
////

const forked = fork('./queue-worker.js', ['fitbit']);

forked.on('close', function(code) {
    log.warn(`child process "queue-worker" exited with code ${code}`);
    //set timeout and restart?
});

forked.on('message', function(message) {
    log.info(`child process message: ${message}`);
    //set timeout and restart?
});

forked.on('exit', function() {
    log.info('exit child from child');
    forked.kill();
});

process.on('exit', function() {
    log.info('exit child from parent');
    if (forked) {
        process.kill(-forked.pid);
    }
});

////
// routing
////

// redirect the user to the Fitbit authorization page
app.get('/', (req, res, next) => {
    log.info('redirect from /');
    res.redirect('/modules/fibit/login');
    next();
});

app.get('/modules', (req, res, next) => {
    log.info('redirect from /modules');
    res.redirect('/modules/fibit/login');
    next();
});

/**
 * Redirect the user to the Fitbit authorization page
 * @see https://dev.fitbit.com/build/reference/web-api/oauth2/#authorization-page
 */
app.get('/modules/fibit/login', (req, res, next) => {
    let { session_id } = req.query;

    /// DEV
    if (typeof session_id === 'undefined') {
        session_id = Date.now();
    }
    /// end DEV

    // https://dev.fitbit.com/build/reference/web-api/oauth2/#authorization-page
    let uri = 'https://www.fitbit.com/oauth2/authorize?';

    uri += serializeUriParams({
        client_id: APP_FITBIT_CLIENTID,
        response_type: 'code',
        scope: 'heartrate profile sleep',
        redirect_uri: APP_FITBIT_REDIRECTURI,
        state: session_id,
    });

    res.redirect(uri);
    next();
});

// After receiving the authorization code (valid 10 minutes)
// fetch the first access_token and store it in queue, (we have 8 hours time)
// on creation of the queue file the watch script should be triggered an deal with the data crawling
// @see https://dev.fitbit.com/build/reference/web-api/oauth2/#access-token-request
app.get('/modules/fitbit/callback', (req, res, next) => {
    const { code, state } = req.query; // state === session_id
    const auth = Buffer.from(`${APP_FITBIT_CLIENTID}:${APP_FITBIT_CLIENTSECRET}`).toString('base64');

    const payload = {
        code,
        grant_type: 'authorization_code',
        client_id: APP_FITBIT_CLIENTID,
        redirect_uri: APP_FITBIT_REDIRECTURI,
        state, // session_id
        expires_in: 28800
    };

    let cached = null;

    fetch('https://api.fitbit.com/oauth2/token', {
        method: 'post',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
        },

        body: serializeUriParams(payload),
    })
    .then(response => response.json())
    .then((data) => {
        cached = Object.assign({
            _session_id: state,
            _created: Math.floor(Date.now() / 1000),
        }, data);

        forked.send({
            job: 'create',
            session_id: state,
            data: cached,
        });
        return cached;
    })
    .then(() => {
        res.json(cached); //DEV
        next();
    })
    .catch((err) => {
        res.status(400).json(err);
        next();
    });

});

////
// launch
////

app.listen(port, () => log.info(`Express app listening on port ${port}!`));
