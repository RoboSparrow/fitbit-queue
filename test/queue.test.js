const assert = require('assert');

const path = require('path');
const fs = require('fs');

require('../config');
const queue = require('../queue');

const { APP_QUEUE_DIR } = process.env;
const API = `api-${Date.now()}`;

const sleep = m => new Promise(r => setTimeout(r, m));

/* eslint-disable no-bitwise */
/* eslint-disable camelcase */

describe('Queue', function() {
    describe('init()', function() {
        it('should create directories recursively',
            async function() {
                const apiDir = await queue.init(API);
                assert(apiDir === path.resolve(APP_QUEUE_DIR, API));
                fs.accessSync(path.resolve(APP_QUEUE_DIR, API), fs.R_OK | fs.W_OK);
            });
    });

    describe('create()', function() {
        it('create a queued file with contents',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, { test: 'hello' });
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const contents = fs.readFileSync(file, 'utf8');
                const obj = JSON.parse(contents);

                assert(obj.test === 'hello');
                assert(obj.session_id === session_id);
                assert(obj.created);
                assert(obj.updated);
                assert(obj.updated === obj.created);
            });
    });

    describe('read()', function() {
        it('parses JSON content from an existing file',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, { test: 'hello' });
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const obj = await queue.read(file);

                assert(obj.test === 'hello');
                assert(obj.session_id === session_id);
                assert(obj.created);
            });

        it('rejects if a file doesn\'t exist',
            async function() {
                await queue.init(API);
                const file = path.resolve(APP_QUEUE_DIR, API, 'doesnotexist');
                fs.writeFileSync(file, '{Hello');

                try {
                    await queue.read(file);
                    assert('content was parsed' === true);
                } catch (e) {
                    assert(1 > 0);
                }
            });

        it('rejects on invalid JSON content',
            async function() {
                await queue.init(API);
                const file = path.resolve(APP_QUEUE_DIR, API, 'invalid.txt');
                fs.writeFileSync(file, '{Hello');

                try {
                    await queue.read(file);
                    assert('content was parsed' === true);
                } catch (e) {
                    assert(1 > 0);
                }
            });
    });

    describe('lock()', function() {
        it('lock a queued file',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const locked = await queue.lock(file);
                assert(locked !== file);
                fs.accessSync(locked, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });
            });

        it('doesn\'t lock an alredy locked file',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const locked = await queue.lock(file);
                assert(locked !== file);
                fs.accessSync(locked, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });

                const lockedAgain = await queue.lock(locked);
                assert(lockedAgain === locked);
                fs.accessSync(lockedAgain, fs.R_OK | fs.W_OK);

                assert(locked === lockedAgain);
            });

    });

    describe('unlock()', function() {
        it('unlock a locked file',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const locked = await queue.lock(file);
                assert(locked !== file);
                fs.accessSync(locked, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });

                const unlocked = await queue.unlock(locked);
                assert(unlocked !== locked);
                assert(unlocked === file);
                fs.accessSync(unlocked, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(locked, fs.R_OK), { code: 'ENOENT' });
            });

        it('unlocking a not locked file has no effect',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const unlocked = await queue.unlock(file);
                assert(unlocked === file);
                fs.accessSync(unlocked, fs.R_OK | fs.W_OK);
            });

        it('unlocking a released file has no effect',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const locked = await queue.lock(file);
                assert(locked !== file);
                fs.accessSync(locked, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });

                const released = await queue.release(locked);
                assert(released !== file);
                assert(released !== locked);
                fs.accessSync(released, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });
                assert.throws(() => fs.accessSync(locked, fs.R_OK), { code: 'ENOENT' });

                const unlocked = await queue.unlock(released);
                assert(unlocked === released);
                fs.accessSync(unlocked, fs.R_OK | fs.W_OK);
            });
    });

    describe('release()', function() {

        it('removing an unlocked file will be rejected with an Error',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                try {
                    await queue.release(file);
                    assert(false === true);
                } catch (e) {
                    fs.accessSync(file, fs.R_OK | fs.W_OK);
                }
            });

        it('release a locked file',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const locked = await queue.lock(file);
                assert(locked !== file);
                fs.accessSync(locked, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });

                const released = await queue.release(locked);

                assert(released !== file);
                assert(released !== locked);
                fs.accessSync(released, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });
                assert.throws(() => fs.accessSync(locked, fs.R_OK), { code: 'ENOENT' });
            });

        it('releasing an alredy released file will be rejected with an Error',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const locked = await queue.lock(file);
                assert(locked !== file);
                fs.accessSync(locked, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });

                const released = await queue.release(locked);
                assert(released !== file);
                assert(released !== locked);
                fs.accessSync(released, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });
                assert.throws(() => fs.accessSync(locked, fs.R_OK), { code: 'ENOENT' });

                try {
                    await queue.release(released);
                    assert(false === true);
                } catch (e) {
                    fs.accessSync(released, fs.R_OK | fs.W_OK);
                }
            });

    });

    describe('remove()', function() {

        it('removing a unlocked will be rejected with an Error',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                try {
                    await queue.remove(file);
                    assert(false === true);
                } catch (e) {
                    fs.accessSync(file, fs.R_OK | fs.W_OK);
                }
            });

        it('removing a locked file will be rejected with an Error',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const locked = await queue.lock(file);
                assert(locked !== file);
                fs.accessSync(locked, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });

                try {
                    await queue.remove(file);
                    assert(false === true);
                } catch (e) {
                    fs.accessSync(locked, fs.R_OK | fs.W_OK);
                }
            });

        it('removing a released file',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, code);
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const locked = await queue.lock(file);
                assert(locked !== file);
                fs.accessSync(locked, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });

                const released = await queue.release(locked);
                assert(released !== file);
                assert(released !== locked);
                fs.accessSync(released, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });
                assert.throws(() => fs.accessSync(locked, fs.R_OK), { code: 'ENOENT' });

                const removed = await queue.remove(released);
                assert(removed === undefined);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });
                assert.throws(() => fs.accessSync(locked, fs.R_OK), { code: 'ENOENT' });
                assert.throws(() => fs.accessSync(released, fs.R_OK), { code: 'ENOENT' });
            });

    });

    describe('update()', function() {

        it('updated JSON content of a locked file',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);
                const file = await queue.create(API, session_id, { test: 'hello' });
                fs.accessSync(file, fs.R_OK | fs.W_OK);

                const locked = await queue.lock(file);
                assert(locked !== file);
                fs.accessSync(locked, fs.R_OK | fs.W_OK);
                assert.throws(() => fs.accessSync(file, fs.R_OK), { code: 'ENOENT' });

                await sleep(50);
                const udata = await queue.update(locked, { test: 'bye', newprop: true });

                assert(udata.test === 'bye');
                assert(udata.newprop === true);
                assert(new Date(udata.updated).getTime() > new Date(udata.created).getTime());

                const contents = fs.readFileSync(locked, 'utf8');
                assert(contents === JSON.stringify(udata));
            });

        it('rejects updating JSON content of non-locked files',
            async function() {
                const code = Date.now();
                const session_id = `session-${code}`;

                await queue.init(API);

                const file = await queue.create(API, session_id, code);
                try {
                    await queue.update(file);
                    assert(false === true);
                } catch (e) {
                    fs.accessSync(file, fs.R_OK | fs.W_OK);
                }

                const locked = await queue.lock(file);
                // nothing, tested before

                const released = await queue.release(locked);
                try {
                    await queue.update(released);
                    assert(false === true);
                } catch (e) {
                    fs.accessSync(released, fs.R_OK | fs.W_OK);
                }
            });
    });

    describe('findNextTask()', function() {

        it('returns NULL if no tasks available',
            async function() {
                const api = `findnexttask-${Date.now()}`;

                await queue.init(api);
                const task = await queue.findNextTask(api);
                assert(task === null);
            });

        it('returns first task file',
            async function() {
                const code = Date.now();
                const api = `findnexttask-${Date.now()}`;
                const session_id = `session-${code}`;

                await queue.init(api);
                const file1 = await queue.create(api, session_id, code);
                await sleep(50);
                const file2 = await queue.create(api, session_id, code);

                const task = await queue.findNextTask(api);
                assert(file1 !== file2);
                assert(task === file1);
            });

    });

    describe('findTasks()', function() {

        it('returns an empty array if no tasks available',
            async function() {
                const api = `findtasks-${Date.now()}`;

                await queue.init(api);
                const tasks = await queue.findTasks(api);
                assert(Array.isArray(tasks));
                assert(tasks.length === 0);
            });

        it('returns an array task file',
            async function() {
                const code = Date.now();
                const api = `findtask-${Date.now()}`;
                const session_id = `session-${code}`;

                await queue.init(api);
                const file1 = await queue.create(api, session_id, code);
                await sleep(50);
                const file2 = await queue.create(api, session_id, code);

                const tasks = await queue.findTasks(api);
                assert(Array.isArray(tasks));
                assert(tasks.length === 2);
                assert(tasks[0] === file1);
                assert(tasks[1] === file2);
            });

    });

    describe('watch()', function() {

        it('triggers callbacks on file creation',
            async function() {
                const code = Date.now();
                const api = `watchtasks-${Date.now()}`;
                const session_id = `session-${code}`;

                const expected = [];
                const files_created = [];
                const files_removed = [];
                const triggered_apis = [];

                await queue.init(api);

                const { TASK_CREATED, TASK_REMOVED } = queue;
                const watcher = await queue.watch(api, (file, mode, _api) => {

                    if (mode === TASK_CREATED) {
                        files_created.push(file);
                    }
                    if (mode === TASK_REMOVED) {
                        files_removed.push(file);
                    }
                    triggered_apis.push(_api);

                });

                expected[0] = await queue.create(api, session_id, code);
                await sleep(50);
                expected[1] = await queue.create(api, session_id, code);
                await sleep(50);

                await queue.lock(expected[0]);
                await sleep(50);
                await queue.lock(expected[1]);
                await sleep(50);

                assert(files_created.length === expected.length);
                assert(files_removed.length === expected.length);
                assert(triggered_apis.length === expected.length * 2);

                expected.forEach((file, index) => {
                    assert(file === files_created[index]);
                    assert(file === files_removed[index]);
                });

                triggered_apis.forEach((entry) => {
                    assert(entry === api);
                });

                watcher.close();
            });

    });

});
