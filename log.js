/* eslint-disable no-bitwise */
const path = require('path');
const fs = require('fs');
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

require('./config');

const {
    errors,
    colorize,
    printf,
    timestamp,
    label,
} = format;

const {
    APP_LOG_DIR,
    APP_LOG_LEVEL,
} = process.env;

const defaultFormat = function(labelText = '') {
    return format.combine(
        timestamp(),
        errors({ stack: true }),
        label({ label: labelText }),
        printf(info => `(pid: ${process.pid}) ${info.timestamp} ${info.label}  ${info.level}: ${info.message} ${info.stack || ''}`)
    );
};

const consoleFormat = function(labelText = '') {
    return format.combine(
        colorize(),
        timestamp(),
        errors({ stack: true }),
        label({ label: labelText }),
        printf(info => `(pid: ${process.pid}) ${info.timestamp} ${info.label} ${info.level}: ${info.message} ${info.stack || ''}`)
    );
};

const init = function(labelText = '', logDir = '') {
    const dir = logDir || APP_LOG_DIR;

    // test access or thow exception
    fs.accessSync(dir, fs.W_OK | fs.R_OK | fs.X_OK);

    const logger = createLogger({
        level: APP_LOG_LEVEL || 'info',
        format: defaultFormat(labelText),
        transports: [
            new DailyRotateFile({
                filename: path.resolve(`${dir}/%DATE%.app.log`),
                datePattern: 'YYYY-MM-DD-HH',
                zippedArchive: true,
                maxSize: '20m',
                maxFiles: '14d'
            })
        ],
    });

    if (process.env.NODE_ENV !== 'production') {
        logger.add(new transports.Console({
            format: consoleFormat(labelText),
        }));
    }

    logger.debug('initialized log');

    return logger;
};

module.exports = {
    init,
};
