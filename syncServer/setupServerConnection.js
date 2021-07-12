import * as Y from 'yjs';

import { encoding, decoding, mutex, map } from 'lib0';

import * as awarenessProtocol from '../y-protocols/awareness';
import * as syncProtocol from '../y-protocols/sync';

//import debounce from './debounce';

//import { callbackHandler, isCallbackSet } from './callback';

//const CALLBACK_DEBOUNCE_WAIT = parseInt(process.env.CALLBACK_DEBOUNCE_WAIT) || 2000;
//const CALLBACK_DEBOUNCE_MAXWAIT = parseInt(process.env.CALLBACK_DEBOUNCE_MAXWAIT) || 10000;

// const wsReadyStateConnecting = 0;
// const wsReadyStateOpen = 1;
// const wsReadyStateClosing = 2; // eslint-disable-line
// const wsReadyStateClosed = 3; // eslint-disable-line

// disable gc when using snapshots!
const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0';
const persistenceDir = process.env.YPERSISTENCE;
/**
 * @type {{bindState: function(string,WSSharedDoc):void, writeState:function(string,WSSharedDoc):Promise<any>, provider: any}|null}
 */
let persistence = null;
if (typeof persistenceDir === 'string') {
  console.info('Persisting documents to "' + persistenceDir + '"');
  // @ts-ignore
  const LeveldbPersistence = require('y-leveldb').LeveldbPersistence;
  const ldb = new LeveldbPersistence(persistenceDir);
  persistence = {
    provider: ldb,
    bindState: async (docName, ydoc) => {
      const persistedYdoc = await ldb.getYDoc(docName);
      const newUpdates = Y.encodeStateAsUpdate(ydoc);
      ldb.storeUpdate(docName, newUpdates);
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
      ydoc.on('update', update => {
        ldb.storeUpdate(docName, update);
      });
    },
    writeState: async (docName, ydoc) => {}
  };
}

/**
 * @param {{bindState: function(string,WSSharedDoc):void,
 * writeState:function(string,WSSharedDoc):Promise<any>,provider:any}|null} persistence_
 */
export const setPersistence = persistence_ => {
  persistence = persistence_;
};

/**
 * @return {null|{bindState: function(string,WSSharedDoc):void,
 * writeState:function(string,WSSharedDoc):Promise<any>}|null} used persistence layer
 */
export const getPersistence = () => persistence;

/**
 * @type {Map<string,WSSharedDoc>}
 */
export const docs = new Map();
// exporting docs so that others can use it

const messageSync = 0;
const messageAwareness = 1;
// const messageAuth = 2

/**
 * @param {Uint8Array} update
 * @param {any} origin
 * @param {WSSharedDoc} doc
 */
const updateHandler = (update, origin, doc) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  doc.channels.forEach((_, channel) => send(doc, channel, message));
};

class WSSharedDoc extends Y.Doc {
  /**
   * @param {string} name
   */
  constructor(name) {
    super({ gc: gcEnabled });
    this.name = name;
    this.mux = mutex.createMutex();
    /**
     * Maps from channel to set of controlled user ids. Delete all user ids from awareness when this channel is closed
     * @type {Map<Object, Set<number>>}
     */
    this.channels = new Map();
    /**
     * @type {awarenessProtocol.Awareness}
     */
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);
    /**
     * @param {{ added: Array<number>, updated: Array<number>, removed: Array<number> }} changes
     * @param {Object | null} channel Origin is the connection that made the change
     */
    const awarenessChangeHandler = ({ added, updated, removed }, channel) => {
      const changedClients = added.concat(updated, removed);
      if (channel !== null) {
        const channelControlledIDs = /** @type {Set<number>} */ (this.channels.get(channel));
        if (channelControlledIDs !== undefined) {
          added.forEach(clientID => {
            channelControlledIDs.add(clientID);
          });
          removed.forEach(clientID => {
            channelControlledIDs.delete(clientID);
          });
        }
      }
      // broadcast awareness update
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients));
      const buff = encoding.toUint8Array(encoder);
      this.channels.forEach((_, c) => {
        send(this, c, buff);
      });
    };
    this.awareness.on('update', awarenessChangeHandler);
    this.on('update', updateHandler);
    // if (isCallbackSet) {
    //   this.on('update', debounce(callbackHandler, CALLBACK_DEBOUNCE_WAIT, { maxWait: CALLBACK_DEBOUNCE_MAXWAIT }));
    // }
  }
}

/**
 * Gets a Y.Doc by name, whether in memory or on disk
 *
 * @param {string} docname - the name of the Y.Doc to find or create
 * @param {boolean} gc - whether to allow gc on the doc (applies only when created)
 * @return {WSSharedDoc}
 */
export const getYDoc = (docname, gc = true) =>
  map.setIfUndefined(docs, docname, () => {
    const doc = new WSSharedDoc(docname);
    doc.gc = gc;
    if (persistence !== null) {
      persistence.bindState(docname, doc);
    }
    docs.set(docname, doc);
    return doc;
  });

/**
 * @param {any} channel
 * @param {WSSharedDoc} doc
 * @param {Uint8Array} message
 */
const messageListener = (channel, doc, message) => {
  const encoder = encoding.createEncoder();
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case messageSync:
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, doc, null);
      if (encoding.length(encoder) > 1) {
        send(doc, channel, encoding.toUint8Array(encoder));
      }
      break;
    case messageAwareness: {
      awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), channel);
      break;
    }
  }
};

/**
 * @param {WSSharedDoc} doc
 * @param {any} channel
 */
const closeConn = (doc, channel) => {
  if (doc.channels.has(channel)) {
    /**
     * @type {Set<number>}
     */
    // @ts-ignore
    const controlledIds = doc.channels.get(channel);
    doc.channels.delete(channel);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    if (doc.channels.size === 0 && persistence !== null) {
      // if persisted, we store state and destroy ydocument
      persistence.writeState(doc.name, doc).then(() => {
        doc.destroy();
      });
      docs.delete(doc.name);
    }
  }
  //channel.close();
  channel.terminate();
};

/**
 * @param {WSSharedDoc} doc
 * @param {any} channel
 * @param {Uint8Array} m
 */
const send = (doc, channel, m) => {
  channel.send(m);

  //⚠️ ⚠️ ⚠️ ⚠️ maybe this is useful... test and think about it
  // we can send into closed channel as of now (???)
  // if (channel.readyState !== wsReadyStateConnecting && channel.readyState !== wsReadyStateOpen) {
  //   closeConn(doc, channel);
  // }
  // try {
  //   channel.send(
  //     m,
  //     /** @param {any} err */ err => {
  //       err != null && closeConn(doc, channel);
  //     }
  //   );
  // } catch (e) {
  //   closeConn(doc, channel);
  // }
};

//const pingTimeout = 30000;

/**
 * @param {any} channel
 * @param {any} req
 * @param {any} opts
 */
export const setupServerConnection = (channel, { docName, gc = true } = {}) => {
  channel.binaryType = 'arraybuffer';
  // get doc, initialize if it does not exist yet
  const doc = getYDoc(docName, gc);
  doc.channels.set(channel, new Set());
  // listen and reply to events
  channel.on('receive_binary', /** @param {ArrayBuffer} message */ message => messageListener(channel, doc, message));

  channel.on('dischannelect', () => {
    closeConn(doc, channel);
  });

  // put the following in a variables in a block so the interval handlers don't keep in in
  // scope
  {
    // send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, channel, encoding.toUint8Array(encoder));
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())));
      send(doc, channel, encoding.toUint8Array(encoder));
    }
  }
};
