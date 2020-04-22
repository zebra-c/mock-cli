const http = require("http");
const fs = require("fs").promises;
const chalk = require("chalk");
const path = require("path");
const url = require("url");
const crypto = require("crypto");
const ejs = require("ejs");
const { promisify } = require("util");
const mime = require("mime");
const zlib = require("zlib");
const terminalLink = require("terminal-link");
const renderHTMl = promisify(ejs.renderFile);
const { createReadStream } = require("fs");

const DefaultValue = {
  port: 3000,
  dir: "./",
  pic: [".png", ".jpeg", ".gif", ".jpg"],
};
const log = console.log;

class Server {
  constructor(config) {
    this.config = { ...DefaultValue, ...config };
    this.server = http.createServer(this.handlerRequest.bind(this));
    this.error();
  }
  async handlerRequest(req, res) {
    this.req = req;
    this.res = res;
    let { pathname = "/" } = url.parse(req.url);
    pathname = decodeURIComponent(pathname);
    const absPath = path.join(process.cwd(), this.config.dir, pathname);
    this.pathname = pathname;
    this.absPath = absPath;
    await this.handlerPath(absPath, () => {
      this.handlerJSON(absPath);
    });
  }
  async handlerPath(absPath, cb) {
    try {
      const stateObj = await fs.stat(absPath);
      if (stateObj.isFile()) {
        if (!(await this.handlerImg(absPath))) {
          return;
        }
        this.handlerFile(absPath, stateObj);
      } else if (stateObj.isDirectory()) {
        this.handlerDir(absPath);
      }
    } catch {
      cb & cb();
    }
  }
  async handlerJSON(absPath) {
    absPath = absPath + ".json";
    await this.handlerPath(absPath, (err) => {
      log(err);
      this.handlerError();
    });
  }
  async handlerImg(absPath) {
    const extname = path.extname(absPath);
    if (this.config.pic.includes(extname)) {
      let referrer =
        this.req.headers["referer"] || this.req.headers["referrer"] || "";
      const host = this.req.headers.host;
      if (referrer) {
        referrer = url.parse(referrer).host;
        if (referrer != host) {
          const errorFile = path.resolve(__dirname, "../public/error.png");
          createReadStream(errorFile).pipe(this.res);
          return false;
        }
      }
    }
    return true;
  }
  async cache(absPath, stateObj) {
    const { res, req } = this;
    res.setHeader("Expires", new Date(Date.now() + 10 * 1000).toGMTString());
    const ctime = stateObj.ctime.toGMTString();
    res.setHeader("Last-Modified", ctime);
    res.setHeader("Cache-Control", "no-cache");
    let content = await fs.readFile(absPath);
    const ifModifiedSince = req.headers["if-modified-since"];
    const isNoneMatch = req.headers["if-none-match"];
    const etag = crypto.createHash("md5").update(content).digest("base64");
    res.setHeader("Etag", etag);
    if (isNoneMatch !== etag) {
      return false;
    }
    if (ifModifiedSince !== ctime) {
      return false;
    }
    return true;
  }
  async handlerFile(absPath, stateObj) {
    const cache = await this.cache(absPath, stateObj);
    if (cache) {
      this.res.statusCode = 304;
      this.res.end();
      return true;
    }
    this.res.setHeader(
      "Content-Type",
      (mime.getType(absPath) || "text/plain") + ";charset=utf-8"
    );
    const gzip = this.isAcceptGzip();
    if (gzip) {
      createReadStream(absPath).pipe(gzip).pipe(this.res);
    } else {
      createReadStream(absPath).pipe(this.res);
    }
  }
  isAcceptGzip() {
    const acceptEncoding = this.req.headers["accept-encoding"] || "";
    if (acceptEncoding.includes("gzip")) {
      this.res.setHeader("Content-Encoding", "gzip");
      return zlib.createGzip();
    } else if (acceptEncoding.includes("deflate")) {
      this.res.setHeader("Content-Encoding", "deflate");
      return zlib.createDeflate();
    }
    return false;
  }
  async handlerDir(absPath) {
    const fileDirList = await fs.readdir(absPath);
    const templatePath = path.resolve(__dirname, "../public", "index.html");
    const fileList = fileDirList.map((item) => ({
      name: item,
      path: path.join(this.pathname, item),
    }));
    const r = await renderHTMl(templatePath, {
      fileList,
    });
    this.res.setHeader("Content-Type", "text/html; charset=utf-8");
    this.res.end(r);
  }
  handlerError() {
    this.res.statusCode = 404;
    this.res.end("404");
  }
  start() {
    const { port } = this.config;
    this.server.listen(port, () => {
      log(`  - Local:   ${chalk.cyan(`http://localhost:${this.config.port}`)}`);
    });
  }
  error() {
    this.server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        let { port } = this.config;
        log(chalk.red(`${port}端口号，已被占用`));
        ++this.config.port;
        this.server.listen(this.config.port);
      }
    });
  }
}

module.exports = Server;
