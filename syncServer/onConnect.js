import { setupServerConnection } from './setupServerConnection.js';

function onConnect({ program, channel }) {
  //⚠️⚠️⚠️⚠️ pass docName in handshake init message somehow.. or in "sublane", see todo.txt
  setupServerConnection(channel, { docName: 'count-demo' });
}

export default onConnect;
