/**
 * Wrap a function so that any thrown error is caught and routed to a handler.
 *
 * The returned fallback is substituted for the function's normal return value, so
 * callers always get a value back instead of having to wrap every call site in
 * try/catch. This is the central design decision: we trade information about
 * success vs. failure (an error propagated up the stack) for a straight-line
 * code path that never throws. If the caller needs to branch on failure they
 * must inspect the returned value themselves, or wrap again at the outer call.
 *
 * Both synchronous and async functions are accepted. The returned value is
 * always a Promise when `task` is async (i.e. returns a thenable) and never a
 * Promise when `task` is synchronous. This keeps the caller's downstream code
 * stable: a sync task wrapped today does not silently become async, and an
 * async task stays awaitable.
 *
 * @template T The success return type of `task`.
 * @template F The fallback return type.
 * @param {(this: any) => T | PromiseLike<T>} task The function to guard.
 * @param {Object} opts
 * @param {(err: unknown) => F} opts.onError Called with whatever `task` threw
 *   (errors, primitives, anything). It MUST return a value of type `F` (the
 *   fallback). It MUST NOT throw; throwing inside `onError` defeats the entire
 *   boundary and will reject the returned promise. This is deliberate: we
 *   cannot safely invent a fallback for a failing error-handler, and silently
 *   hiding the failure would mask a real bug in calling code.
 * @returns {T | Promise<T | F>} The original return for success, or the
 *   fallback for failure. Promise-returning tasks yield a Promise.
 */
export function wrap(task, opts) {
  if (typeof task !== "function") {
    throw new TypeError(`wrap: expected a function, got ${typeof task}`);
  }
  if (opts === null || typeof opts !== "object") {
    throw new TypeError(`wrap: expected opts object, got ${opts === null ? "null" : typeof opts}`);
  }
  if (typeof opts.onError !== "function") {
    throw new TypeError(`wrap: opts.onError must be a function`);
  }
  const onError = opts.onError;

  return function wrapped() {
    // Capture the synchronous phase first. If `task` throws before it reaches
    // its first `await`/`return`, the throw is observable here and we route it.
    let result;
    try {
      result = task.apply(this, arguments);
    } catch (syncErr) {
      return onError(syncErr);
    }

    // Determine async-ness by duck-typing. We check `then` against a function
    // rather than using `instanceof Promise` so user-defined thenables and
    // cross-realm Promises are handled uniformly. Whatever the source, if it
    // can `then` we treat it as async.
    const maybeThen =
      (result !== null && typeof result === "object") || typeof result === "function"
        ? result.then
        : undefined;
    if (typeof maybeThen !== "function") {
      return result;
    }

    // We construct our own Promise so we control the rejection path entirely.
    // Relying on the original thenable's rejection would let an error from
    // inside `onError` be swallowed by some thenable implementations.
    return new Promise((resolve, reject) => {
      // `then` with two callbacks: first consumes resolution, second consumes
      // rejection. Inside rejection we run `onError` synchronously in the
      // microtask; if it throws we let that reject the outer Promise, by
      // design (see JSDoc).
      //
      // We pass the handlers positionally rather than using arrow closures
      // bound to `result`, because some thenables invoke `.then` callbacks
      // with their own `this`. Arrow functions make `this` irrelevant here.
      maybeThen.call(
        result,
        (value) => resolve(value),
        (err) => {
          try {
            resolve(onError(err));
          } catch (handlerErr) {
            reject(handlerErr);
          }
        }
      );
    });
  };
}
