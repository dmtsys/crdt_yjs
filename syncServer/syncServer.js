import onConnect from './onConnect';

export default function initServer({ program, protocol }) {
  program.registerProtocol({ protocol, onConnect });
}
