const path = require('path');
const fs = require('fs');

const { promisify } = require('util');

const writeFileAsync = promisify(fs.writeFile);
const mkDirAsync = promisify(fs.mkdir);

const mkDirRecursive = function(dirpath) {
    return mkDirAsync(dirpath, { recursive: true });
};

const save = function(filepath, data) {
    const dir = path.dirname(filepath);
    const json = JSON.stringify(data, null, 4);
    return mkDirRecursive(dir)
    .then(() => writeFileAsync(filepath, json))
    .then(() => data);
};

module.exports = {
    save,
    mkDirRecursive,
};
