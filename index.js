import initSyncServer from './syncServer/syncServer';
import _initCrdtClient from './crdtClient/crdtClient';

import { log } from 'dmt/common';

const protocol = 'dmt/crdt';

export function initCrdtServer(program) {
  initSyncServer({ program, protocol });
  log.green('✓ CRDT server ready');
}

export function initCrdtClient(host) {
  _initCrdtClient({ protocol, host });
}
