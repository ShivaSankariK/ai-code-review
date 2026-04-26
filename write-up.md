# Write-Up

## Overview

This document describes the improvements made to the server-driven UI SDK and Todo demo, and lists structural issues that were identified but not fully addressed within the time window.

---

## Changes Implemented

### 1. SDK hardening (`backend/sdk.js`)

**Problem — `constructor.name` as the component kind**
The `_sendCreate` method used `this.constructor.name` to determine the component kind sent over the wire. JavaScript minifiers (esbuild, Terser) mangle class names, so this would silently break if the SDK were ever bundled. The fix is a static `kind` property on each subclass (`Button.kind = "Button"` etc.), which is explicit and minification-safe.

**Problem — unbounded WebSocket message parsing**
The incoming message handler called `JSON.parse` on the raw payload without any size check. A client (or attacker) could send a multi-megabyte payload and exhaust the server's memory before the parse even began. A `MAX_MESSAGE_BYTES = 64 KB` guard was added that rejects oversized messages immediately.

**Problem — missing structural validation before dispatch**
After parsing, the handler dispatched directly on `msg.type === "event"`. Any JSON value — including arrays and non-objects — was accepted without structural checks. This could lead to unexpected type coercions downstream. The fix adds an explicit guard that validates the shape of the message (`typeof msg === "object"`, non-null, non-array, with string `id` and `event` fields) before dispatching.

**Problem — unguarded `_flush` could corrupt state on error**
If any component's `_sendCreate` threw (e.g. due to a bad prop), `_batchBuffer` was left non-null, blocking all future flushes. A `try/finally` block now ensures `_batchBuffer` is always cleared to `null` before returning.

---

### 2. Frontend — WebSocket reconnection and environment config (`frontend/src/App.tsx`)

**Problem — single connection attempt, no reconnect**
The original `useEffect` opened one WebSocket and never retried. If the backend server restarted or a network hiccup occurred, the user would see a blank "waiting for server..." screen until they manually refreshed. Automatic reconnection with exponential back-off (1 s -> 2 s -> 4 s ... capped at 30 s) was added. The node tree is cleared on disconnect so a fresh reconnect repaints cleanly.

**Problem — hardcoded `ws://localhost:3001`**
The URL was embedded in source code, making it impossible to deploy to any other environment without a code change. It is now read from the `VITE_WS_URL` environment variable, falling back to the dev default. Deployments only need to set the variable in their `.env` file.

**Problem — untyped server message processing**
The message handler used `typeof msg` inferred as `any` via `JSON.parse`, relying on TypeScript to silently ignore field access on unknown shapes. The handler was rewritten with explicit `Record<string, unknown>` casts at each field access and a `try/catch` around the parse call, making type errors visible at the call site.

**Problem — undifferentiated loading/error state**
The original code returned `<p>Waiting for server...</p>` for every non-rendered state. The new code exposes a `ConnectionStatus` type and renders distinct messages for "connecting", "connection lost — reconnecting", and "connected but no nodes yet".

---

### 3. Todo app improvements (`backend/index.js`)

**Problem — duplicated inline style objects**
Every button, input, and container in the file had its style object written inline. The same 5-field object appeared 3-4 times with identical content. A shared `STYLES` constant at the top of the file eliminates the duplication and makes visual changes a single-line edit.

**Problem — no input length validation**
`handleAdd` accepted any text from the client without checking its length. A `MAX_TODO_LENGTH = 200` constant is now enforced server-side with an early return and a `console.warn`.

**Problem — double-submit on rapid clicks**
Clicking "Add" twice quickly before the server finished processing the first click would insert duplicate todos. An `addInProgress` boolean flag now guards the handler, making it idempotent for the duration of a single execution turn.

**Problem — double-click on "Edit" entered a broken state**
Calling `handleEdit` on a todo that was already being edited would destroy nodes that no longer existed (the label and editBtn had already been destroyed on first entry). An early-return guard (`if (todo.editInput) return`) was added at the top of `handleEdit`.

**Problem — unvalidated event payload type in change handlers**
The `change` event payload is typed as `unknown` in the SDK. The original handlers assigned it directly to `currentInputvalue` and `editState.value` without checking `typeof`. The handlers now coerce with `typeof v === "string" ? v : ""` before assigning.

**Problem — hardcoded port**
The port `3001` was hardcoded. It is now read from `process.env.PORT` with a numeric fallback.

---

### 4. Frontend — structural refactoring (separation of concerns)

**Problem — monolithic `App.tsx`**
The original frontend placed WebSocket connection logic, message processing, state management, and all UI rendering inside a single `App.tsx` file. This mixed infrastructure concerns with presentation, making each harder to change or test independently.

The codebase was restructured into clearly bounded modules:

* `hooks/useServerUI.ts` — owns all WebSocket lifecycle, reconnection, and state management. Completely decoupled from rendering.
* `utils/wsConfig.ts` — isolates the environment-configurable WebSocket URL as a single named export.
* `utils/applyMessage.ts` — a pure, framework-free function that applies server messages to the node tree. Can be unit-tested without React.
* `types/ui.ts` — centralises shared type definitions (`NodeData`, `TreeState`, `ConnectionStatus`) so they are defined once and imported everywhere they are needed.
* `components/ServerNode.tsx` — handles recursive server-driven node rendering only.
* `components/ConnectionStatusView.tsx` — renders connection state feedback only.
* `components/InputNode.tsx` — manages local controlled-input state, isolated from the rest of the tree.

This layout means a change to WebSocket logic touches only `useServerUI.ts`, a change to message parsing touches only `applyMessage.ts`, and a change to a component touches only that component — with no risk of silently affecting the other layers.

---

## Issues Identified but Not Implemented

### Server-side state persistence
All Todo data lives in a per-connection `todos` array inside the `wss.on("connection")` closure. If the server restarts or the client reconnects, all todos are lost. A persistent store (even a simple JSON file) would fix this, but it requires defining a hydration protocol (the server would need to re-emit `create` messages for each existing todo on reconnect), which is a more invasive SDK-level change.

### No authentication or origin validation on WebSocket connections
Any process that can reach port 3001 can connect and fire events. In a production deployment, the WebSocket upgrade should verify an origin header or session token. This is infrastructure-level work that was out of scope here.

### `on()` can only be called before flush
The SDK comment says event handlers must be registered before a component is flushed. There is no enforcement: calling `.on()` after a component is created silently registers the handler server-side but sends no update to the client (the client's `events` array is stale). The fix would be an `update`-style mechanism for event handler changes, which is a material SDK redesign.

### No message acknowledgement / ordering guarantees
The protocol has no sequence numbers or ACKs. If the client sends two events in quick succession, the server processes them in arrival order. A slow `handleAdd` (e.g. if it awaited a database write) could interleave with a second click. The current synchronous implementation is safe, but this would need addressing if any handler became async.

### Frontend has no error boundary
If `ServerNode` throws during render (e.g. because a malformed `kind` arrives), the whole React tree unmounts without any user-visible recovery UI. A React `ErrorBoundary` wrapping the roots would contain the failure.
