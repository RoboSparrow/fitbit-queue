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
const Logger = require('./log');

const { APP_QUEUE_DIR } = process.env;
const EXT_LOCKED = 'locked';
const EXT_RELEASED = 'released';
const EXT_TASK = 'tasks';

const TASK_CREATED = 'created';
const TASK_REMOVED = 'removed';

const log = Logger.init('queue');

const isLocked = function(filename) {
    const dir = path.basename(path.dirname(filename));
    return dir === EXT_LOCKED;
};

const isReleased = function(filename) {
    const dir = path.basename(path.dirname(filename));
    return dir === EXT_RELEASED;
};

const isTask = function(filename) {
    const dir = path.basename(path.dirname(filename));
    return dir === EXT_TASK;
};

const init = function(api) {
    const apiDir = path.resolve(APP_QUEUE_DIR, api);

    return mkDirAsync(apiDir + '/' + EXT_TASK, { recursive: true })
    .then(() => mkDirAsync(apiDir + '/' + EXT_LOCKED, { recursive: true }))
    .then(() => mkDirAsync(apiDir + '/' + EXT_RELEASED, { recursive: true }))
    .then(() => apiDir);
};

const create = function(api, session_id, jsondata) {
    const filename = `${Date.now()}.${session_id}`;
    const file = path.resolve(APP_QUEUE_DIR, api, EXT_TASK, filename);
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

    const newFile = file.replace(`${EXT_TASK}/`, `${EXT_LOCKED}/`);
    return renameAsync(file, newFile)
    .then(() => newFile);
};

const unlock = function(file) {
    if (!isLocked(file)) {
        log.warn(`Trying unlocking an unlocked file: ${file}!`);
        return Promise.resolve(file);
    }

    const newFile = file.replace(`${EXT_LOCKED}/`, `${EXT_TASK}/`);
    return renameAsync(file, newFile)
    .then(() => newFile);
};

const release = function(file) {
    if (!isLocked(file)) {
        return Promise.reject(new Error(`Trying to release an an unlocked file: ${file}!`));
    }

    const newFile = file.replace(`${EXT_LOCKED}/`, `${EXT_RELEASED}/`);
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
    const apiDir = path.resolve(APP_QUEUE_DIR, api, EXT_TASK);
    return readdirAsync(apiDir)
    .then(files => files.map(file => `${apiDir}/${file}`));
};

const findNextTask = function(api) {
    const apiDir = path.resolve(APP_QUEUE_DIR, api, EXT_TASK);
    return readdirAsync(apiDir)
    .then((files) => {
        return (files.length) ? `${apiDir}/${files[0]}` : null;
    });
};

const FSWATCH_EVENT = 'rename';
const watch = function(api, callback) {

    const taskDir = path.resolve(APP_QUEUE_DIR, api, EXT_TASK);

    return Promise.resolve(
        fs.watch(taskDir, (eventType, filename) => {

            if (!filename) {
                log.warn('filename not provided');
                return;
            }

            if (eventType !== FSWATCH_EVENT) {
                return;
            }

            const filePath = `${taskDir}/${filename}`;
            fs.access(filePath, fs.F_OK, function(err) {
                const mode = (err) ? TASK_REMOVED : TASK_CREATED;
                try {
                    callback(filePath, mode, api);
                } catch (e) {
                    log.error(e.toString());
                }
            });

        })
    );
};

module.exports = {
    // for tests
    EXT_LOCKED,
    EXT_RELEASED,
    EXT_TASK,

    TASK_CREATED,
    TASK_REMOVED,

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
