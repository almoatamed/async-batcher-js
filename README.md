
# async-batcher

A tiny, dependency-free TypeScript library to coalesce many asynchronous requests into periodic batches. It's useful when you have many requesters asking for the same resource(s) and want to reduce the number of underlying calls (for example: database selects, remote API calls, or cache lookups).

## Features

- Collect multiple requests that arrive within a short time window and dispatch them in a single batch.
- Per-batcher configurable period and optional execution timeout with AbortSignal support.
- Minimal API: create a batcher and call run() to get a Promise for the individual result.
- No runtime dependencies; written in TypeScript and ships as an ESM module.

## Installation

Install the package from npm and build the TypeScript sources locally if you need to.

```bash
npm install async-batcher-js
# to build locally from source (optional)
npm install
npm run build
```

## Quick usage

Import and create a batcher by providing:

- batchPeriodInMs: number — how frequently batches are executed (milliseconds).
- batcherCallback: (promises, timeoutAbortSignal) => void | Promise<void> — receives the collected requests and an AbortSignal that is triggered if the batch execution exceeds the configured timeout.
- timeoutPeriod?: number | false — optional timeout for the batcherCallback in milliseconds. When set, the library will abort the callback via the provided AbortSignal and reject all pending promises with BatcherTimeoutError if the timeout elapses.

API reference

Types

- BatcherPromise<D, T>
	- content: D — the data passed when calling run().
	- resolve: (result: T) => void — resolve function for the single request.
	- reject: (error: any) => void — reject function for the single request.

Errors

- BatcherStoppedError — thrown synchronously by run() when the batcher is stopped.
- BatcherTimeoutError — created and used when a batch callback takes longer than the configured timeoutPeriod.

## createAsyncBatcher<PassedDataType, ReturnedResultType>(props)

### Props

- batchPeriodInMs: number — required. How often (ms) the batched callback is executed.
- batcherCallback(promises, timeoutAbortSignal) — required. Function called with the array of pending promises to resolve/reject. Receives an AbortSignal as second argument for optional cooperative cancellation.
- timeoutPeriod?: number | undefined | false — optional. Milliseconds to wait for the batcherCallback before aborting and rejecting all promises. When false/undefined/0, no timeout is applied.
- name?: string — optional. Included in console error logs for easier diagnosis.

### Returns: an object with methods

- run(data: PassedDataType): Promise<ReturnedResultType>
	- Enqueue a single request. Returns a Promise that will be resolved or rejected by the `batcherCallback`.
	- If the batcher is stopped, run() throws a `BatcherStoppedError`.

- stop(): void — stops the batcher and clears any scheduled timers. Future calls to run() will throw `BatcherStoppedError` until `start()` is called.

- start(): void — sets the batcher to running state. Does not immediately run a batch; requests will be collected and dispatched on the next scheduled period.

- changePeriod(periodInMs: number): void — change the batch period in milliseconds.

How it works (implementation notes)

- The batcher collects incoming requests passed to `run()` in an in-memory array (`pendingPromises`).
- Each entry contains the content (the request data) and the resolve/reject functions for the returned Promise.
- When the period timer fires, the batcher copies the pending requests, clears the shared array, and calls `batcherCallback(promises, abortSignal)`.
- `batcherCallback` should resolve or reject each promise individually.
- If `timeoutPeriod` is set, the batcher creates an AbortController and will abort (call `abort()`) when the timeout elapses. The library will then reject all promises with a `BatcherTimeoutError` and log the error.

## Example

Below is an example (also included in the repository as `example.ts`) that shows a common usage: coalescing database user lookups by id.

Full example (source)

You can view the complete `example.ts` used for the snippet on GitHub:

[example.ts on GitHub](https://github.com/almoatamed/async-batcher/blob/main/example.ts)

```ts
import { createAsyncBatcher } from "async-batcher-js";

// A mock database and a fast select function that accepts an array of ids
function selectUsersMany(ids: string[]) {
	return mockDatabase.users.filter((u) => ids.includes(u.id));
}

const batcher = createAsyncBatcher<string, User>({
	batcherCallback(promises, timeoutAbortSignal) {
		// Build a quick map keyed by id and resolve/reject each promise
		const users = selectUsersMany(promises.map((p) => p.content)).reduce((map, u) => {
			map[u.id] = u;
			return map;
		}, {} as Record<string, User>);

		for (const p of promises) {
			const user = users[p.content];
			if (user) p.resolve(user);
			else p.reject(new Error("user not found"));
		}
	},
	batchPeriodInMs: 1000,
	timeoutPeriod: 60_000,
});

// elsewhere in request handling
const user = await batcher.run(userId);
```

## Error handling and logging

- The batcher logs errors to the console with the optional `name` included. Your callback should handle its own errors and ensure each promise is resolved/rejected. If the callback throws, the batcher will catch the error, log it, and reject all promises.

## Notes and best practices

- Keep `batcherCallback` idempotent and fast. Prefer doing I/O (database or API) that can accept many keys at once.
- When using `timeoutPeriod`, make sure the callback respects AbortSignal (if possible) and cleans up resources promptly.
- The batcher does not persist pending requests across restarts — it's an in-memory utility.

## License

MIT

