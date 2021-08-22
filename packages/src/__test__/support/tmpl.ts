import fs from "fs";

const variableRegExp = /\$([0-9a-zA-Z\.]+)/g;

export default function renderFile(fileName: string, options: any, callback: (err: Error, str?: string) => void) {
    function onReadFile(err: Error, str: string) {
        if (err) {
            callback(err);
            return;
        }

        try {
            str = str.replace(variableRegExp, generateVariableLookup(options));
        } catch (e) {
            err = e;
            err.name = "RenderError";
        }

        callback(err, str);
    }

    fs.readFile(fileName, "utf8", onReadFile);
}

function generateVariableLookup(data: any) {
    return function variableLookup(str: string, path: string) {
        const parts = path.split(".");
        let value = data;

        for (let i = 0; i < parts.length; i++) {
            value = value[parts[i]];
        }

        return value;
    };
}
