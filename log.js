const path = require('path');
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const { combine, printf, label } = format;
let logDir = path.resolve('log');

const customFormat = printf(({ level, message }) => {
    const timestamp = new Date().toISOString();
    return `${timestamp} ${level}: ${message}`;
});

const init = function(logdir = '') {

    if (logdir) {
        logDir = path.resolve(logdir);
    }

    const logger = createLogger({
        level: 'info',
        format: combine(
            label(`(pid: ${process.pid})`),
            customFormat
        ),
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
            format: format.simple()
        }));
    }

    return logger;
};

const log = init();

module.exports = log;
