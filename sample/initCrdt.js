import { initCrdtClient, initCrdtServer } from './crdt_yjs';

export default function initCrdt(program) {
  // server device
  if (program.device.id == 'dmt-server') {
    initCrdtServer(program);
    initCrdtClient();
  }

  // pc device
  if (program.device.id == 'dmt-new') {
    initCrdtClient('192.168.0.10'); // server ip
  }
}
