const fs = require('fs');
const path = require('path');
const child_process = require('child_process'); // eslint-disable-line camelcase

require('./config');

// Set up vars

const {
    APP_USER,
    APP_GROUP,
    APP_LOG_DIR,
    APP_SESSION_DIR,
    APP_QUEUE_DIR,
    APP_WORKING_DIR,
} = process.env;

const vars = {
    WorkingDirectory: path.resolve(APP_WORKING_DIR),
    User: APP_USER,
    Group: APP_GROUP,
    LogDir: path.resolve(APP_LOG_DIR),
    QueueDir: path.resolve(APP_QUEUE_DIR),
    SessionDir: path.resolve(APP_SESSION_DIR),
};

////
// Helpers
////

const colors = {
    green: text => `\x1b[32m${text}\x1b[0m`,
    red: text => `\x1b[31m${text}\x1b[0m`,
    yellow: text => `\x1b[33m${text}\x1b[0m`,
    blue: text => `\x1b[34m${text}\x1b[0m`,
};

const parseTemplate = function(service) {
    const contents = fs.readFileSync(path.resolve(service), 'utf8');
    return contents.replace(/\${([^}]*)}/g, (r, k) => {
        return vars[k];
    });
};

const li = colors.blue('    * ');
const fail = colors.red('    [ERROR] ');

const cmd = function(command) {
    try {
        return child_process.execSync(command, { stdio: 'inherit' });
    } catch (e) {
        console.log(`${fail}command returned an error: ${e.toString()}`);
        process.exit();
    }
    return false;
};

////
// Validate input
////

const args = process.argv.slice(2);
let service = '';
if (args.length) {
    service = path.basename(args[0]);
}

if (!service) {
    console.log(`${fail} No service selected (node ./install <service file>)!`);
    process.exit();
}

fs.accessSync(service, fs.constants.R_OK); // test file

console.log(`\n${colors.yellow('Installing service:')} ${service}\n`);

const serviceLocation = `/etc/systemd/system/${service}`;

if (process.getuid && process.getuid() !== 0) {
    console.log(`${fail} sudo permissions required!`);
    process.exit();
}

console.log(`${li} check if service is active`);

////
// Check, disable and remove existing service
////

let out;

const isActive = false;
out = '';
try {
    out = child_process.execSync(`sudo systemctl is-active ${service}`);
} catch (e) {
    out = e.stdout.toString().trim();
    //If the process times out or has a non-zero exit code, this method will throw.
}
console.log(out.toString().trim());

if (isActive) {
    console.log(`${li} stop active service`);
    cmd(`sudo systemctl stop ${service}`);
}

console.log(`${li} check if service is enabled`);

const isEnabled = false;
out = '';
try {
    out = child_process.execSync(`sudo systemctl is-enabled ${service}`);
} catch (e) {
    out = e.stdout.toString().trim();
    //If the process times out or has a non-zero exit code, this method will throw.
}
console.log(out.toString().trim());

if (isEnabled) {
    console.log(`${li} disable service`);
    cmd(`sudo systemctl disable ${service}`);
}

////
// install
////

const serviceFileContent = parseTemplate(service);
const owner = `${vars.User}:${vars.Group}`;

// console.log(serviceFileContent);
// process.exit();

console.log(`${li} set ownership ${owner} to log queue session directories`);

cmd(`sudo mkdir -p ${vars.LogDir}`);
cmd(`sudo chown -R ${owner} ${vars.LogDir}`);
cmd(`sudo chmod -R 755 ${vars.LogDir}`);

cmd(`sudo mkdir -p ${vars.QueueDir}`);
cmd(`sudo chown -R ${owner} ${vars.QueueDir}`);
cmd(`sudo chmod -R 755 ${vars.QueueDir}`);

cmd(`sudo mkdir -p ${vars.SessionDir}`);
cmd(`sudo chown -R ${owner} ${vars.SessionDir}`);
cmd(`sudo chmod -R 755 ${vars.SessionDir}`);

console.log(`${li} writing unit file to: ${serviceLocation}`);
fs.writeFileSync(serviceLocation, serviceFileContent, 'utf8');

console.log(`${li} Enable service: ${service}`);
cmd(`sudo systemctl enable ${service}`);

console.log(`${li} Start service: ${service}`);
cmd(`sudo systemctl reload-or-restart ${service}`);

console.log(`${li} Status of service: ${service}`);
const ret = cmd(`sudo systemctl status ${service}`);

if (ret === false) {
    console.log(`${fail} sudo systemctl status ${service} FAILED!`);
    console.log(`${li} journalctl of service: ${service}`);
    cmd(`sudo journalctl -b -u ${service}`);
}

////
// Finish
////

console.log(colors.green('\nFINISHED!\n'));
console.log('    ------------------------\n');
console.log(`${li} unit-file: /etc/systemd/system/${service}`);
console.log(`${li} stop: sudo systemctl stop ${service}`);
console.log(`${li} start: sudo systemctl start ${service}`);
console.log(`${li} restart: sudo systemctl restart ${service}`);
console.log(`${li} journalctl: sudo journalctl -n -u ${service}`);
console.log(`${li} logs: cat /var/log/syslog | grep ss-`);
