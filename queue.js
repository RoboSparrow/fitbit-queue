/**
 * A queue item has three states: "task", "locked" and "released"
 *
 * Given an api id of "myapi"  and session id of "987654321"
 * New:
 *   - file: queue/myapi/987654321
 * Locked (being processed):
 *   - file: queue/myapi/lock.987654321
 * Released (done):
 *   - file: queue/myapi/done.987654321
 *
 * [queue]
 *    |_ task.<sessid 1>
 *    |_ locked.<sessid 2>
 *    |_ done.<sessid 3>
 *
 * Released files should be either cleaned up by the processing script or by a cron-like task
 */

/* eslint-disable camelcase */

const path = require('path');
const fs = require('fs');

const { promisify } = require('util');

const writeFileAsync = promisify(fs.writeFile);
const renameAsync = promisify(fs.rename);
const mkDirAsync = promisify(fs.mkdir);
const unlinkAsync = promisify(fs.unlink);
const readdirAsync = promisify(fs.readdir);
const readFileAsync = promisify(fs.readFile);

require('./config');
const log = require('./log');

const { APP_QUEUE_DIR } = process.env;
const LOCK_PREFIX = 'locked';
const RELEASE_PREFIX = 'released';
const TASK_PREFIX = 'tasks';

const isLocked = function(filename) {
    const dir = path.basename(path.dirname(filename));
    return dir === LOCK_PREFIX;
};

const isReleased = function(filename) {
    const dir = path.basename(path.dirname(filename));
    return dir === RELEASE_PREFIX;
};

const isTask = function(filename) {
    const dir = path.basename(path.dirname(filename));
    return dir === TASK_PREFIX;
};

const init = function(api) {
    const apiDir = path.resolve(APP_QUEUE_DIR, api);

    return mkDirAsync(apiDir + '/' + TASK_PREFIX, { recursive: true })
    .then(() => mkDirAsync(apiDir + '/' + LOCK_PREFIX, { recursive: true }))
    .then(() => mkDirAsync(apiDir + '/' + RELEASE_PREFIX, { recursive: true }))
    .then(() => apiDir);
};

const create = function(api, session_id, jsondata) {
    const filename = `${Date.now()}.${session_id}`;
    const file = path.resolve(APP_QUEUE_DIR, api, TASK_PREFIX, filename);
    const now = new Date().toISOString();

    const data = Object.assign({
        session_id,
        created: now,
        updated: now,
    }, jsondata);

    return writeFileAsync(file, JSON.stringify(data))
    .then(() => file);
};

const read = function(file) {
    return readFileAsync(file)
    .then((contents) => {
        try {
            return JSON.parse(contents);
        } catch (e) {
            return Promise.reject(e);
        }
    });
};

const update = function(file, merge) {
    if (!isLocked(file)) {
        return Promise.reject(new Error(`Trying updating an non-locked file: ${file}!`));
    }

    let data = null;
    return read(file)
    .then((oldData) => {
        data = Object.assign(oldData, merge, {
            updated: new Date().toISOString(),
        });
        return writeFileAsync(file, JSON.stringify(data));
    })
    .then(() => data);
};

const lock = function(file) {
    if (!isTask(file)) {
        log.warn(`Trying locking an non-task or processed file: ${file}!`);
        return Promise.resolve(file);
    }

    const newFile = file.replace(`${TASK_PREFIX}/`, `${LOCK_PREFIX}/`);
    return renameAsync(file, newFile)
    .then(() => newFile);
};

const unlock = function(file) {
    if (!isLocked(file)) {
        log.warn(`Trying unlocking an unlocked file: ${file}!`);
        return Promise.resolve(file);
    }

    const newFile = file.replace(`${LOCK_PREFIX}/`, `${TASK_PREFIX}/`);
    return renameAsync(file, newFile)
    .then(() => newFile);
};

const release = function(file) {
    if (!isLocked(file)) {
        return Promise.reject(new Error(`Trying to release an an unlocked file: ${file}!`));
    }

    const newFile = file.replace(`${LOCK_PREFIX}/`, `${RELEASE_PREFIX}/`);
    return renameAsync(file, newFile)
    .then(() => newFile);
};

const remove = function(file) {
    if (!isReleased(file)) {
        return Promise.reject(new Error(`Trying to remove an unreleased file: ${file}!`));
    }

    return unlinkAsync(file);
};

const findTasks = function(api) {
    const apiDir = path.resolve(APP_QUEUE_DIR, api, TASK_PREFIX);
    return readdirAsync(apiDir)
    .then(files => files.map(file => `${apiDir}/${file}`));
};

const findNextTask = function(api) {
    const apiDir = path.resolve(APP_QUEUE_DIR, api, TASK_PREFIX);
    return readdirAsync(apiDir)
    .then((files) => {
        return (files.length) ? `${apiDir}/${files[0]}` : null;
    });
};

const EVENT_TRIGGER = 'rename';
const watch = function(api, callback) {

    const apiDir = path.resolve(APP_QUEUE_DIR, api, TASK_PREFIX);

    return Promise.resolve(
        fs.watch(apiDir, (eventType, filename) => {

            if (!filename) {
                log.warn('filename not provided');
                return;
            }

            if (eventType !== EVENT_TRIGGER) {
                return;
            }

            const filePath = `${apiDir}/${filename}`;
            if (!isTask(filePath)) {
                return;
            }

            console.log(`${EVENT_TRIGGER}: ${filename}`);
            fs.access(filePath, fs.F_OK, function(err) {
                if(err) {
                    return; // file was removed
                }

                try {
                    callback(filePath, api);
                } catch (e) {
                    console.error(e);
                }
            });

        })
    );
};

module.exports = {
    // for tests
    LOCK_PREFIX,
    RELEASE_PREFIX,
    TASK_PREFIX,

    init,
    create,
    read,
    update,
    lock,
    unlock,
    remove,
    release,

    findTasks,
    findNextTask,
    watch,
};
