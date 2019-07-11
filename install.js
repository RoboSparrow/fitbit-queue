const fs = require('fs');
const path = require('path');
const child_process = require('child_process'); // eslint-disable-line camelcase

const service = 'ss-modules.service';
const serviceLocation = `/etc/systemd/system/${service}`;

const vars = {
    Description: 'SurveySystem Modules',
    ExecStart: `${__dirname}/index.js`,
    WorkingDirectory: __dirname,
    User: 'www-data',
    Group: 'www-data',
    SyslogIdentifier: 'ss-node',
};

const parseTemplate = function() {
    const contents = fs.readFileSync(path.resolve(service), 'utf8');
    return contents.replace(/\${([^}]*)}/g, (r, k) => {
        return vars[k];
    });
};

const cmd = function(command) {
    try {
        return child_process.execSync(command, { stdio: 'inherit' });
    } catch (e) {
        console.log(`command returned an error: ${e.toString()}`);
        return false;
    }
};

const li = '   * ';

////
//
////

if (process.getuid && process.getuid() !== 0) {
    console.log('sudo permissions required!');
    process.exit();
}

console.log(`${li} check if service is active`);

////
//
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
//
////

const serviceFileContent = parseTemplate();
// console.log(serviceFileContent);
// process.exit();

console.log(`${li} writing unit file to: ${serviceLocation}`);
fs.writeFileSync(serviceLocation, serviceFileContent, 'utf8');

console.log(`${li} Enable service: ${service}`);
cmd(`sudo systemctl enable ${service}`);

console.log(`${li} Start service: ${service}`);
cmd(`sudo systemctl start ${service}`);

console.log(`${li} Status of service: ${service}`);
const ret = cmd(`sudo systemctl status ${service}`);

if (ret === false) {
    console.log(`${li} FAILED!`);
    console.log(`${li} journalctl of service: ${service}`);
    cmd(`sudo journalctl -b -u ${service}`);
}

console.log('\nFINISHED!\n');
console.log('------------------------');
console.log(`${li} unit-file: /etc/systemd/system/${service}`);
console.log(`${li} stop: sudo systemctl stop ${service}`);
console.log(`${li} start: sudo systemctl start ${service}`);
console.log(`${li} restart: sudo systemctl restart ${service}`);
console.log(`${li} journalctl: sudo journalctl -u ${service}`);
console.log(`${li} logs: cat /var/log/syslog | grep ${vars.SyslogIdentifier}`);
