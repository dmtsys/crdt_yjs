import dmt from 'dmt/common';
const { log } = dmt;

import { connect } from 'dmt/connectome';

import * as Y from 'yjs';
import { ConnectomeProvider } from '../y-connector/y-connector';

export default function initCrdtClient({ protocol, host }) {
  const port = 7780; // ⚠️ magic constant!! move somewhere in dmtHelper

  const connector = connect({ protocol, host, port });

  const ydoc = new Y.Doc();

  new ConnectomeProvider(connector, 'count-demo', ydoc);

  // array of numbers which produce a sum
  const yarray = ydoc.getArray('count');

  // observe changes of the sum
  yarray.observe(event => {
    // print updates when the data changes
    log.cyan('new sum: ' + yarray.toArray().reduce((a, b) => a + b));
    //console.log(yarray.toArray());
  });

  // add 1 to the sum
  setInterval(() => {
    yarray.push([1]); // => "new sum: 1"
  }, 2000);
}
