const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = { silent: 0, error: 1, info: 2 };

const level = LEVELS[LOG_LEVEL] ?? LEVELS.info;

module.exports = {
  info: (...args) => level >= LEVELS.info && process.stdout.write(args.join(' ') + '\n'),
  error: (...args) => level >= LEVELS.error && process.stderr.write(args.join(' ') + '\n'),
};
