import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "ui",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.ts"`,
        `src="/src/main.ts?v=${nanoid()}"`,
      );
      // Inject auto-config script: set gateway URL and token so the UI connects automatically
      const autoConfig = `<script>
(function(){try{
  var proto=location.protocol==='https:'?'wss':'ws';
  var gw=proto+'://'+location.host+'/';
  var sk='openclaw.control.settings.v1';
  var s=JSON.parse(localStorage.getItem(sk)||'{}');
  if(!s.gatewayUrl){s.gatewayUrl=gw;localStorage.setItem(sk,JSON.stringify(s));}
  var scope=(function(u){try{var p=new URL(u);var pp=p.pathname==='/'?'':p.pathname.replace(/\\/+$/,'')||p.pathname;return p.protocol+'//'+p.host+pp;}catch(e){return u;}})(s.gatewayUrl||gw);
  var tk='openclaw.control.token.v1:'+scope;
  if(!sessionStorage.getItem(tk)){sessionStorage.setItem(tk,'dzeck-openclaw-gateway-2024');}
}catch(e){}})();
</script>`;
      template = template.replace("</head>", autoConfig + "</head>");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
