const fs = require('fs');
const dotenv = require('dotenv');

// base config
dotenv.config();

// merge env config
try {
    fs.accessSync(`.env.${process.env.NODE_ENV}`, fs.R_OK);
    const envConfig = dotenv.parse(fs.readFileSync(`.env.${process.env.NODE_ENV}`));
    Object.keys(envConfig).forEach((key) => {
        if (key.substring(0, 4) === 'APP_') {
            process.env[key] = envConfig[key];
        }
    });
} catch (err) {
    //nothing
}

