export type BatcherPromise<D, T> = {
    resolve: (arg: T) => void;
    reject: (error: any) => void;
    content: D;
};

type Timer = undefined | NodeJS.Timeout | number | string;

export class BatcherStoppedError extends Error {}
export class BatcherTimeoutError extends Error {}

export const createAsyncBatcher = <PassedDataType, ReturnedResultType>(props: {
    batchPeriodInMs: number;
    batcherCallback: (
        promises: BatcherPromise<PassedDataType, ReturnedResultType>[],
        timeoutAbortSignal: AbortSignal
    ) => Promise<void> | void;
    name?: string;
    timeoutPeriod?: number | undefined | false;
}) => {
    let period = props.batchPeriodInMs;

    const pendingPromises: BatcherPromise<PassedDataType, ReturnedResultType>[] = [];

    let timer: Timer = undefined;

    let stopped = false;

    let lastRunTimestamp = -Infinity;

    let timeoutPeriod = props.timeoutPeriod;

    const logError = (error: any) => {
        console.error(`batcher ${props.name ? `[${props.name}]` : ""} error:\n`, error);
    };

    const timeoutCallback = async () => {
        lastRunTimestamp = Date.now();
        const promises = [...pendingPromises];
        pendingPromises.length = 0;
        let timeoutTimer: Timer = undefined;

        const rejectAll = (error: any) => {
            for (const p of promises) {
                p.reject(error);
            }
        };

        const timeoutAbortController = new AbortController();
        if (timeoutPeriod) {
            timeoutTimer = setTimeout(() => {
                const error = new BatcherTimeoutError(
                    "Batcher Timeout: batcher took to long to execute, attempting aborting."
                );
                timeoutAbortController.abort();
                logError(error);
                rejectAll(error);
            }, timeoutPeriod);
        }
        try {
            await props.batcherCallback(promises, timeoutAbortController.signal);
        } catch (error) {
            logError(error);
            rejectAll(error);
        } finally {
            clearTimeout(timeoutTimer);
        }
    };

    const reschedule = () => {
        if (stopped || (timer !== undefined && Date.now() - lastRunTimestamp > period)) {
            return;
        }
        clearTimeout(timer);
        setTimeout(timeoutCallback, period);
    };

    return {
        stop() {
            clearTimeout(timer);
            stopped = true;
        },
        start() {
            stopped = false;
        },
        changePeriod(periodInMs: number) {
            period = periodInMs;
        },
        run(data: PassedDataType) {
            if (stopped) {
                throw new BatcherStoppedError(
                    "batcher is stopped, if you want to continue run the `start`, and then continue"
                );
            }
            return new Promise<ReturnedResultType>((resolve, reject) => {
                pendingPromises.push({
                    content: data,
                    reject: reject,
                    resolve: resolve,
                });
                reschedule();
            });
        },
    };
};
