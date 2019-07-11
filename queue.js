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
const LOCK_PREFIX = 'lock.';
const RELEASE_PREFIX = 'done.';
const TASK_PREFIX = 'task.';

const isLocked = function(filename) {
    return filename.substr(0, 5) === LOCK_PREFIX;
};

const isReleased = function(filename) {
    return filename.substr(0, 5) === RELEASE_PREFIX;
};

const isTask = function(filename) {
    const prefix = filename.substr(0, 5);
    return prefix === TASK_PREFIX;
};

const init = function(api) {
    const apiDir = path.resolve(APP_QUEUE_DIR, api);
    return mkDirAsync(apiDir, { recursive: true })
    .then(() => apiDir);
};

const create = function(api, session_id, jsondata) {
    const file = path.resolve(APP_QUEUE_DIR, api, TASK_PREFIX + session_id);
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
    const filename = path.basename(file);

    if (!isLocked(filename)) {
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
    const filename = path.basename(file);

    if (!isTask(filename)) {
        log.warn(`Trying locking an non-task or processed file: ${file}!`);
        return Promise.resolve(file);
    }

    const newFile = path.resolve(path.dirname(file), `${LOCK_PREFIX}${filename}`);
    return renameAsync(file, newFile)
    .then(() => newFile);
};

const unlock = function(file) {
    const filename = path.basename(file);

    if (isReleased(filename)) {
        log.warn(`Trying locking an alredy released file: ${file}!`);
        return Promise.resolve(file);
    }

    const newFile = path.resolve(path.dirname(file), filename.replace(LOCK_PREFIX, ''));
    return renameAsync(file, newFile)
    .then(() => newFile);
};

const release = function(file) {
    const filename = path.basename(file);

    if (!isLocked(filename)) {
        return Promise.reject(new Error(`Trying to release an an unlocked file: ${file}!`));
    }

    const newFile = path.resolve(path.dirname(file), filename.replace(LOCK_PREFIX, RELEASE_PREFIX));
    return renameAsync(file, newFile)
    .then(() => newFile);
};

const remove = function(file) {
    const filename = path.basename(file);

    if (!isReleased(filename)) {
        return Promise.reject(new Error(`Trying to remove an unreleased file: ${file}!`));
    }

    return unlinkAsync(file);
};

const findTasks = function(api) {
    const apiDir = path.resolve(APP_QUEUE_DIR, api);
    readdirAsync(apiDir)
    .then((files) => {
        return files.filter(file => isTask(file))
        .map(file => `${apiDir}/${file}`);
    }).catch((err) => {
        console.log(err);
    });
};

const findNextTask = function(api) {
    const apiDir = path.resolve(APP_QUEUE_DIR, api);
    return readdirAsync(apiDir)
    .then((files) => {
        const { length } = files;
        for (let i = 0; i < length; i += 1) {
            if (isTask(files[i])) {
                return `${apiDir}/${files[i]}`;
            }
        }
        return null;
    });
};

const EVENT_TRIGGER = 'rename';
const watch = function(api, callback) {

    const apiDir = path.resolve(APP_QUEUE_DIR, api);

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

        try {
            callback(api, filePath);
        } catch (e) {
            console.error(e);
        }
    });

    return Promise.resolve(apiDir);
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
