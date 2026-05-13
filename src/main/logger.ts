import electronLog from 'electron-log';

electronLog.transports.file.level = 'info';
electronLog.transports.console.level = 'debug';
electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

export const log = electronLog;
