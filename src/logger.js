/* eslint-disable no-console -- This is the logging abstraction layer; console usage is intentional */
const logger = {
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
/* eslint-enable no-console */

module.exports = logger;
