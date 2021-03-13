const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(log => {
      return `${log.timestamp} | ${log.level}: ${log.message}`;
    })
  ),
  transports: [
    new winston.transports.Console({ colorize: true }),

    new winston.transports.File({
      colorize: false,
      json: false,
      maxsize: 5242880, // 5MB
      maxFiles: 15,
      filename: './logs/error.virie_blockexplorer.log',
      level: 'error'
    }),
    new winston.transports.File({
      colorize: false,
      json: false,
      maxsize: 5242880, // 5MB
      maxFiles: 15,
      filename: './logs/info.virie-blockexplorer.log',
      level: 'info'
    })
  ]
});

module.exports = logger;
