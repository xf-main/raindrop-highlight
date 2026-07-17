export default function throttle<T extends (...args: any) => any>(callee: T, timeout: number) {
    let timer: ReturnType<typeof setTimeout> | null = null
    let pending: any[] | null = null

    return function perform(...args: any) {
        //inside the window: remember the latest args for the trailing call
        if (timer) {
            pending = args
            return
        }

        callee(...args)
        timer = setTimeout(function trailing() {
            timer = null
            if (pending) {
                const args = pending
                pending = null
                callee(...args)
                timer = setTimeout(trailing, timeout)
            }
        }, timeout)
    }
}
