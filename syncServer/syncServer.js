import onConnect from './onConnect.js';

export default function initServer({ program, dmtID, protocol }) {
  program.dev(dmtID).registerProtocol(protocol, onConnect);
}
