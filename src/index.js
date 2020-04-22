const Server = require("./core");
const config = require("../src/config");

new Server(config).start();
