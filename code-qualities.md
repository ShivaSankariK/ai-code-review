# Important Code Qualities

## 1. Correctness and Robustness

Code must behave correctly under both happy-path and edge-case conditions. This means validating inputs at trust boundaries (network, user input), handling errors explicitly instead of silently swallowing them, and ensuring that partial failures do not leave the system in an inconsistent state. In this SDK, for example, a malformed WebSocket message should be rejected gracefully rather than crashing the handler or silently corrupting state.

## 2. Security

Inputs from external sources – users, network peers – must never be trusted unconditionally. Specific concerns here include:

- **Payload size limits**: An unbounded JSON payload from a WebSocket client can exhaust server memory.
- **Input sanitisation**: Event payloads should be validated to be the expected type before being forwarded to handlers.
- **Prototype pollution**: Merging untrusted objects with `Object.assign` without validation opens a prototype-pollution vector.

Security is non-negotiable because failures are often silent and the blast radius is large.

## 3. Separation of Concerns

Each module should own one responsibility. Mixing application logic (the Todo app) with infrastructure (the SDK) in the same style-object soup makes both harder to change independently. Style constants, layout helpers, and business logic should each live in their own clearly bounded area so that a change in one does not silently break another.

## 4. Resilience / Defensive Engineering

Network-connected code must anticipate transient failures. A frontend that makes a single WebSocket connection and never retries will appear broken to users whenever the server restarts or a brief network hiccup occurs. Automatic reconnection with exponential back-off is the standard expectation for any persistent-connection UI.

## 5. Readability and Maintainability

Code is read far more often than it is written. Qualities that support readability:

- **Meaningful naming**: variables and functions named after their intent, not their mechanism.
- **Consistent abstraction level**: a function should either orchestrate high-level steps or implement a low-level detail – not both at once.
- **No magic values**: hard-coded strings and numbers repeated across a file should be named constants.
- **Predictable structure**: related concerns grouped together, clear separation between public API and private internals.

## 6. Explicit over Implicit

Relying on language quirks or framework internals for correctness makes code fragile. For example, the SDK uses `this.constructor.name` to derive the component kind sent over the wire – a string that is silently mangled by minifiers. An explicit `static kind` property is more robust and intention-revealing.

## 7. Configuration over Hard-coding

Values that differ between environments (WebSocket URL, port number) should be externalisable via environment variables or a config file. Hard-coding `ws://localhost:3001` in the frontend means the app cannot be deployed anywhere without a source-code change.
