function requireParser(type, options) {
    return require("./parsers" + type)(options);
}
export default {
    text: function (options) {
        return requireParser("json", options);
    },
    raw: function (options) {
        return requireParser("json", options);
    },
    json: function (options) {
        return requireParser("json", options);
    },
    urlencoded: function (options) {
        return requireParser("json", options);
    }
};
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map