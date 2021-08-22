"use strict";

const shell = require("shelljs");

shell.rm("-rf", "packages/lib");
shell.exec("npm run tsc:lib");
shell.exec("npm run babel:lib");
