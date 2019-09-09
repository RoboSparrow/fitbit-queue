const fs = require('fs');
const assert = require('assert');

require('./config');

const {
    APP_PROXY_PORT,
    APP_USER,
    APP_GROUP,
    APP_FITBIT_CLIENTID,
    APP_FITBIT_CLIENTSECRET,
    APP_FITBIT_REDIRECTURI,
    APP_WORKING_DIR,
    APP_LOG_DIR,
    APP_SESSION_DIR,
    APP_QUEUE_DIR,
    APP_LOG_LEVEL,
} = process.env;

fs.mkdirSync(APP_WORKING_DIR, { recursive: true });
fs.mkdirSync(APP_LOG_DIR, { recursive: true });
fs.mkdirSync(APP_SESSION_DIR, { recursive: true });
fs.mkdirSync(APP_QUEUE_DIR, { recursive: true });

fs.accessSync(APP_WORKING_DIR, fs.W_OK);
fs.accessSync(APP_LOG_DIR, fs.W_OK);
fs.accessSync(APP_SESSION_DIR, fs.W_OK);
fs.accessSync(APP_QUEUE_DIR, fs.W_OK);

assert(parseInt(APP_PROXY_PORT, 10) > 0);
assert(APP_USER);
assert(APP_GROUP);
assert(APP_FITBIT_CLIENTID);
assert(APP_FITBIT_CLIENTSECRET);
assert(APP_FITBIT_REDIRECTURI);
assert(APP_LOG_LEVEL);
