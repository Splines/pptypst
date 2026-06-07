import { defineConfig } from "vite";
import fs from "fs";
import process from "node:process";

const input = {
  main: "web/index.html",
  privacy: "web/privacy.html",
  powerpoint: "web/powerpoint.html",
};

function serverHttpsConfig() {
  return {
    key: fs.readFileSync("web/certs/localhost.key"),
    cert: fs.readFileSync("web/certs/localhost.crt"),
  };
}

export default defineConfig(({ command }) => {
  const useHttps = command === "serve" && process.env.PPTYPST_USE_HTTPS !== "false";

  return {
    root: "web",
    base: "/pptypst/",
    build: {
      outDir: "../build/",
      emptyOutDir: true,
      rollupOptions: {
        input,
      },
    },
    server: {
      port: 3155,
      ...(useHttps && { https: serverHttpsConfig() }),
    },
  };
});
