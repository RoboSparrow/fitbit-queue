const path = require('path');
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

require('./config');

const {
    errors,
    colorize,
    printf,
    timestamp,
} = format;

const {
    APP_LOG_DIR,
    APP_LOG_LEVEL,
} = process.env;

let logDir = path.resolve(APP_LOG_DIR);

const defaultFormat = format.combine(
    timestamp(),
    errors({ stack: true }),
    printf(info => `(pid: ${process.pid}) ${info.timestamp} ${info.level}: ${info.message} ${info.stack || ''}`)
);

const consoleFormat = format.combine(
    colorize(),
    timestamp(),
    errors({ stack: true }),
    printf(info => `(pid: ${process.pid}) ${info.timestamp} ${info.level}: ${info.message} ${info.stack || ''}`)
);

const init = function(logdir = '') {

    if (logdir) {
        logDir = path.resolve(logdir);
    }

    const logger = createLogger({
        level: APP_LOG_LEVEL || 'info',
        format: defaultFormat,
        transports: [
            new DailyRotateFile({
                filename: path.resolve(`${logDir}/%DATE%.app.log`),
                datePattern: 'YYYY-MM-DD-HH',
                zippedArchive: true,
                maxSize: '20m',
                maxFiles: '14d'
            })
        ],
    });

    if (process.env.NODE_ENV !== 'production') {
        logger.add(new transports.Console({
            format: consoleFormat,
        }));
    }

    return logger;
};

const log = init();

module.exports = log;
