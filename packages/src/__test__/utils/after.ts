export default function after(count: number, callback: (err?: any, result?: any) => void, err_cb?: (err: Error) => void) {
    let bail = false;
    err_cb = err_cb || noop;
    proxy.count = count;

    return count === 0 ? callback() : proxy;

    function proxy(err: any, result: any) {
        if (proxy.count <= 0) {
            throw new Error("after called too many times");
        }
        --proxy.count;

        // after first error, rest are passed to err_cb
        if (err) {
            bail = true;
            callback(err);
            // future error callbacks will go to error handler
            callback = err_cb;
        } else if (proxy.count === 0 && !bail) {
            callback(null, result);
        }
    }
}

function noop() {}
