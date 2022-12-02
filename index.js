import initSyncServer from './syncServer/syncServer.js';
import _initCrdtClient from './crdtClient/crdtClient.js';

import { log } from 'dmt/common';

const dmtID = 'dmt';
const protocol = 'crdt';

export function initCrdtServer(program) {
  initSyncServer({ program, dmtID, protocol });
  log.green('✓ CRDT server ready');
}

export function initCrdtClient(host) {
  const oldWay = `${dmtID}/${protocol}`;
  _initCrdtClient({ protocol: oldWay, host });
}
