declare module "after" {
    export default function (count: number, callback: () => void, err_cb?: (err: Error) => void);
}
