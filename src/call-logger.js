const callLog = [];

function logCall({ callSid, callerNumber, airportIcao, airportName, timestamp } = {}) {
  const entry = {
    callSid: callSid || null,
    callerNumber: callerNumber || 'unknown',
    airportIcao: airportIcao || null,
    airportName: airportName || null,
    timestamp: timestamp || new Date().toISOString(),
  };
  callLog.push(entry);
  console.log(`[CALL] ${entry.timestamp} from=${entry.callerNumber} airport=${entry.airportIcao || 'menu'}`);
  return entry;
}

function getCallLog() {
  return callLog;
}

function clearCallLog() {
  callLog.length = 0;
}

module.exports = { logCall, getCallLog, clearCallLog };
