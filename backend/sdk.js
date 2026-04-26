const { randomUUID } = require("crypto");

class Component {
  constructor(sdk) {
    this.id = randomUUID();
    this.sdk = sdk;
    this._props = {};
    this._eventHandlers = {};
    this._children = [];
    this._created = false;
    this._updatePending = null;
    sdk._register(this);
  }

  // Sets a prop. In update mode, buffers it; otherwise sets directly on _props.
  _setProp(key, val) {
    if (this._updatePending !== null) {
      this._updatePending[key] = val;
    } else {
      this._props[key] = val;
    }
    return this;
  }

  style(styleObj) {
    return this._setProp("style", styleObj);
  }

  // Registers an event handler server-side. Tells the client to emit this event via WS.
  // Must be called before the component is flushed (create-time only).
  on(event, handler) {
    this._eventHandlers[event] = handler;
    return this;
  }

  // Sets or replaces children. If the component is already created, defers the
  // children update message until after any pending creates have been flushed,
  // ensuring child IDs are known on the client before the parent references them.
  children(...components) {
    this._children = components;
    if (this._created) {
      this.sdk._scheduleCallback(() => {
        this.sdk._send({
          type: "children",
          id: this.id,
          children: components.map((c) => c.id),
        });
      });
    }
    return this;
  }

  // Enters update mode. Subsequent prop calls are buffered until .flush().
  update() {
    this._updatePending = {};
    return this;
  }

  // Sends the buffered prop diff and exits update mode.
  flush() {
    if (this._updatePending !== null) {
      this.sdk._send({ type: "update", id: this.id, props: this._updatePending });
      Object.assign(this._props, this._updatePending);
      this._updatePending = null;
    }
    return this;
  }

  _sendCreate() {
    this._created = true;
    this.sdk._send({
      type: "create",
      id: this.id,
      kind: this.constructor.name,
      props: { ...this._props },
      events: Object.keys(this._eventHandlers),
      children: this._children.map((c) => c.id),
    });
  }

  _dispatch(event, payload) {
    const handler = this._eventHandlers[event];
    if (handler) handler(payload);
  }

  destroy() {
    this.sdk._registry.delete(this.id);
    // Schedule the destroy into the batch so it is always sent atomically
    // alongside any creates/children updates triggered in the same event cycle.
    this.sdk._scheduleCallback(() => {
      this.sdk._send({ type: "destroy", id: this.id });
    });
  }
}

class Button extends Component {
  text(val) {
    return this._setProp("text", val);
  }
}

class Text extends Component {
  text(val) {
    return this._setProp("text", val);
  }
}

class Container extends Component {}

class Input extends Component {
  placeholder(val) {
    return this._setProp("placeholder", val);
  }

  value(val) {
    return this._setProp("value", val);
  }
}

class SDK {
  constructor(ws) {
    this.ws = ws;
    this._registry = new Map();
    this._pendingCreates = [];
    this._pendingCallbacks = [];
    this._flushScheduled = false;

    ws.on("message", (rawData) => {
      try {
        const msg = JSON.parse(rawData);
        if (msg.type === "event") {
          const component = this._registry.get(msg.id);
          if (component) component._dispatch(msg.event, msg.payload ?? null);
        }
      } catch (err) {
        console.error("Failed to parse client message:", err);
      }
    });
  }

  _register(component) {
    this._registry.set(component.id, component);
    this._pendingCreates.push(component);
    this._scheduleFlush();
  }

  // Schedules a callback to run after the next create flush.
  // Used for deferred children updates that depend on pending creates.
  _scheduleCallback(cb) {
    this._pendingCallbacks.push(cb);
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (!this._flushScheduled) {
      this._flushScheduled = true;
      Promise.resolve().then(() => this._flush());
    }
  }

  _flush() {
    this._flushScheduled = false;
    this._batchBuffer = [];

    // Topological sort (post-order DFS) so children are created before parents.
    const pending = this._pendingCreates.splice(0);
    const pendingSet = new Set(pending);
    const visited = new Set();
    const sorted = [];

    const visit = (c) => {
      if (visited.has(c.id)) return;
      visited.add(c.id);
      for (const child of c._children) {
        if (pendingSet.has(child)) visit(child);
      }
      sorted.push(c);
    };

    for (const c of pending) visit(c);
    for (const c of sorted) c._sendCreate();

    // Run deferred callbacks (e.g. dynamic children updates on already-created components).
    const callbacks = this._pendingCallbacks.splice(0);
    for (const cb of callbacks) cb();

    // Emit all messages from this flush as a single atomic batch so the client
    // never renders intermediate states (e.g. newly created nodes with no parent).
    const batch = this._batchBuffer;
    this._batchBuffer = null;
    if (batch.length === 1) {
      this.ws.send(JSON.stringify(batch[0]));
    } else if (batch.length > 1) {
      this.ws.send(JSON.stringify({ type: "batch", messages: batch }));
    }
  }

  _send(msg) {
    if (this.ws.readyState !== 1 /* OPEN */) return;
    // If we're inside a flush, buffer the message into the batch.
    if (this._batchBuffer !== null) {
      this._batchBuffer.push(msg);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  button() {
    return new Button(this);
  }

  text() {
    return new Text(this);
  }

  container() {
    return new Container(this);
  }

  input() {
    return new Input(this);
  }
}

module.exports = { SDK };
