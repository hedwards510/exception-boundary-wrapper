import { test } from "node:test";
import * as assert from "node:assert/strict";
import { wrap } from "../src/index.js";

// Helper: a thenable that does NOT extend native Promise. Used to confirm we
// duck-type rather than relying on instanceof.
function makeThenable(value, mode) {
  return {
    then(onFulfilled, onRejected) {
      // Fire asynchronously, like a real Promise would.
      queueMicrotask(() => {
        if (mode === "reject") onRejected(value);
        else onFulfilled(value);
      });
    },
  };
}

// Helper: get the result of a value that might be a Promise.
async function unwrap(maybe) {
  return maybe;
}

test("sync task success returns the value unchanged", () => {
  const fn = wrap(() => 42, { onError: () => 0 });
  assert.equal(fn(), 42);
});

test("sync task that throws routes to onError and returns fallback", () => {
  let captured;
  const fn = wrap(
    () => {
      throw new Error("boom");
    },
    { onError: (e) => { captured = e; return -1; } }
  );
  assert.equal(fn(), -1);
  assert.ok(captured instanceof Error);
  assert.equal(captured.message, "boom");
});

test("sync task preserves `this` when invoked as a method", () => {
  const obj = {
    base: 10,
    method: wrap(function () {
      return this.base + 5;
    }, { onError: () => -1 }),
  };
  assert.equal(obj.method(), 15);
});

test("sync task preserves `arguments` (no wrapper signature shifts)", () => {
  const fn = wrap(
    function (a, b) {
      return a + b;
    },
    { onError: () => 0 }
  );
  assert.equal(fn(3, 4), 7);
});

test("sync task throwing a non-Error value still reaches onError", () => {
  let captured;
  const fn = wrap(
    () => {
      throw "string error";
    },
    { onError: (e) => { captured = e; return "fallback"; } }
  );
  assert.equal(fn(), "fallback");
  assert.equal(captured, "string error");
});

test("async task success resolves to the value", async () => {
  const fn = wrap(
    () => Promise.resolve(99),
    { onError: () => 0 }
  );
  assert.equal(await unwrap(fn()), 99);
});

test("async task rejection routes to onError and resolves to fallback", async () => {
  let captured;
  const fn = wrap(
    () => Promise.reject(new Error("async boom")),
    { onError: (e) => { captured = e; return -7; } }
  );
  const out = await unwrap(fn());
  assert.equal(out, -7);
  assert.ok(captured instanceof Error);
  assert.equal(captured.message, "async boom");
});

test("async task that throws synchronously before returning a Promise is caught", async () => {
  const fn = wrap(
    () => {
      throw new Error("early throw");
    },
    { onError: () => 5 }
  );
  // Synchronous throw produces a synchronous fallback, not a Promise.
  assert.equal(fn(), 5);
});

test("async task with rejected non-Error value reaches onError", async () => {
  let captured;
  const fn = wrap(
    () => Promise.reject({ code: 42 }),
    { onError: (e) => { captured = e; return "fallback"; } }
  );
  const out = await unwrap(fn());
  assert.equal(out, "fallback");
  assert.deepEqual(captured, { code: 42 });
});

test("custom thenable that resolves is handled via duck-typing", async () => {
  const fn = wrap(
    () => makeThenable("thenable-value", "resolve"),
    { onError: () => "fallback" }
  );
  const out = await unwrap(fn());
  assert.equal(out, "thenable-value");
});

test("custom thenable that rejects routes to onError", async () => {
  let captured;
  const fn = wrap(
    () => makeThenable(new Error("thenable-rej"), "reject"),
    { onError: (e) => { captured = e; return "fallback"; } }
  );
  const out = await unwrap(fn());
  assert.equal(out, "fallback");
  assert.ok(captured instanceof Error);
  assert.equal(captured.message, "thenable-rej");
});

test("if onError throws, the outer Promise rejects (no silent swallow)", async () => {
  const fn = wrap(
    () => Promise.reject(new Error("original")),
    {
      onError: () => {
        throw new Error("handler-exploded");
      },
    }
  );
  await assert.rejects(
    fn(),
    (err) => err instanceof Error && err.message === "handler-exploded"
  );
});

test("wrap rejects non-function task at construction time", () => {
  assert.throws(
    () => wrap(null, { onError: () => 0 }),
    /wrap: expected a function, got object/
  );
});

test("wrap rejects missing opts", () => {
  assert.throws(
    () => wrap(() => 1),
    /wrap: expected opts object, got undefined/
  );
});

test("wrap rejects opts without onError", () => {
  assert.throws(
    () => wrap(() => 1, {}),
    /wrap: opts.onError must be a function/
  );
});
