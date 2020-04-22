const { program } = require("commander");
const { version } = require("../package");

program.version(version);

program.name("mock-cli").usage("-p 3000 -d ./");

program
  .option("-p, --port <type>", "指定端口号", 3000)
  .option("-d, --dir <type>", "指定监听路径", "./");

program.parse(process.argv);
const port = program.port;
const dir = program.dir;

module.exports = {
  port,
  dir,
};
