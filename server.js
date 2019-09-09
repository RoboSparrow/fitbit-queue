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
const fetch = require('node-fetch');

require('./config');
const Logger = require('./log');
const queue = require('./queue');
const { serializeUriParams } = require('./utils');

////
/// bootstrap
////

const {
    APP_PROXY_PORT,
    APP_FITBIT_CLIENTID,
    APP_FITBIT_CLIENTSECRET,
    APP_FITBIT_REDIRECTURI,
} = process.env;

// init log
const log = Logger.init('express-server');

// setup express vars
const API = 'fitbit';

const args = process.argv.slice(2);
let customPort = NaN;
if (args.length) {
    customPort = parseInt(args[0], 10);
}
const port = (!Number.isNaN(customPort) && customPort) ? customPort : APP_PROXY_PORT;

const app = express();

////
// routing
////

// redirect the user to the Fitbit authorization page
app.get('/', (req, res, next) => {
    log.debug('redirect from /');
    res.redirect('/modules/fibit/login');
    next();
});

app.get('/modules', (req, res, next) => {
    log.debug('redirect from /modules');
    res.redirect('/modules/fibit/login');
    next();
});

/**
 * Redirect the user to the Fitbit authorization page
 * @see https://dev.fitbit.com/build/reference/web-api/oauth2/#authorization-page
 */
app.get('/modules/fibit/login', (req, res, next) => {
    const { state } = req.query;

    // https://dev.fitbit.com/build/reference/web-api/oauth2/#authorization-page
    let uri = 'https://www.fitbit.com/oauth2/authorize?';

    uri += serializeUriParams({
        client_id: APP_FITBIT_CLIENTID,
        response_type: 'code',
        scope: 'heartrate profile sleep',
        redirect_uri: APP_FITBIT_REDIRECTURI,
        state,
    });
    log.debug(`redirect to: ${uri}`);
    res.redirect(uri);
    next();
});

// After receiving the authorization code (valid 10 minutes)
// fetch the first access_token and store it in queue, (we have 8 hours time)
// on creation of the queue file the watch script should be triggered an deal with the data crawling
// @see https://dev.fitbit.com/build/reference/web-api/oauth2/#access-token-request
app.get('/modules/fitbit/callback', (req, res, next) => {
    const { code, state } = req.query;
    const { session_id, href } = JSON.parse(state);
    const auth = Buffer.from(`${APP_FITBIT_CLIENTID}:${APP_FITBIT_CLIENTSECRET}`).toString('base64');

    const payload = {
        code,
        grant_type: 'authorization_code',
        client_id: APP_FITBIT_CLIENTID,
        redirect_uri: APP_FITBIT_REDIRECTURI,
        state,
        expires_in: 28800
    };

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
        const queueData = Object.assign({
            session_id,
            href,
        }, data);
        return queue.create(API, session_id, queueData);
    })
    .then(() => {
        // redirect to app
        res.send(`
            <!doctype html>
                <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">

                    <title>(${API}) Thank you!</title>
                    <meta name="description" content="(${API}) Thank you!">

                    <link rel="stylesheet"
                        href="https://stackpath.bootstrapcdn.com/bootstrap/3.4.1/css/bootstrap.min.css"
                        integrity="sha384-HSMxcRTRxnN+Bdg0JdbxYKrThecOKuH5zCYotlSAcp1+c8xmyTe9GYg1l9a69psu"
                        crossorigin="anonymous">
                </head>
                <body>
                    <div class="container">
                        <div class="row">
                            <div class="col">
                                <h1>Thank you</h1>
                                <p>Your <strong>${API}</strong> data will be included in our survey.</p>
                                <a class="btn btn-primary btn-lg" href="${href}">Return to Survey</a>
                            </div>
                        </div>
                    </div>
                </body>
            </html>
        `.trim());
        //  res.redirect(href);
        next();
    })
    .catch((err) => {
        log.error(err);
        res.status(400).json(err);
        next();
    });

});

////
// launch
////

queue.init(API)
.then((queueDir) => {
    app.listen(port, () => {
        log.debug(`Queue for ${API} initalized: ${queueDir}.`);
        log.debug(`Express app listening on port ${port}!`);
    });
})
.catch((err) => {
    log.error(`Failed to initialize queue for ${API}, error: ${err.toString()}`);
    log.error(`Failed to start Express app on port ${port}!`);
    log.error(err);
});
