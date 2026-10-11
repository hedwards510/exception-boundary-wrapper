# exception-boundary

Wrap a synchronous or asynchronous function so that any thrown error is caught and routed to a handler, returning a fallback value to the caller.

```js
import { wrap } from "./src/index.js";

const read = wrap(() => riskyThing(), {
  onError: (err) => { console.log(err); return null; },
});
const value = read(); // never throws; returns null on failure

const fetchUser = wrap(async (id) => api.get(id), {
  onError: () => ({ id: -1, name: "unknown" }),
});
const user = await fetchUser(42); // never rejects
```

## Why

Every call site that invokes a throwing or rejecting function needs its own try/catch (or `.catch`). When dozens of call sites all want the same recovery logic, that boilerplate swamps the actual work. This library extracts the recovery into one `onError` callback per wrapped function and substitutes the fallback for the thrown value, so callers can stay linear.

The trade-off: you lose the ability to distinguish success from failure by control flow. Both paths return a value of the same shape the caller sees, so the caller must inspect the result if the distinction matters. This is the right call for fire-and-forget paths (defaults, caches, logs) and the wrong call when recovery depends on the specific error type.

## Edge cases

- `onError` must not throw. If it does, the outer Promise rejects with that handler error rather than silently returning a second fallback. We deliberately do not invent a fallback for a failing error-handler — hiding it would mask a real bug.
- The wrapper preserves `this` and `arguments` for the wrapped function, so it can be dropped in as a method.
- Async-ness is duck-typed via `.then`, not `instanceof Promise`, so custom thenables and cross-realm Promises are handled uniformly. A sync task stays sync (returns a plain value), an async task stays awaitable.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

