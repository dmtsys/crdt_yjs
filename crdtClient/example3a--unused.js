import * as Y from 'yjs';
import { WebsocketProvider } from './y-websocket.js';

const ydoc = new Y.Doc();

const endpoint = process.env.ENDPOINT || 'localhost:8080';
new WebsocketProvider(`ws://${endpoint}`, 'map-demo', ydoc);

const ymap = ydoc.getMap('map');

ymap.observe(event => {
  console.log(ymap.toJSON());
});

let count = 0;
setInterval(() => {
  ymap.set('keyA', count);
  count += 1;
}, 2000);
