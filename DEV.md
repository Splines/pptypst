# Developer Guide

## How it works

Under the hood, we use the awesome [`typst.ts`](https://github.com/Myriad-Dreamin/typst.ts/) project by Myriad-Dreamin that ships Typst as WebAssembly (WASM). With this, we can client-side render Typst documents directly in the browser without needing any server-side processing.

Why browser? Well, newer PowerPoint Add-ins are essentially websites that can interact with PowerPoint using the [JavaScript API for PowerPoint](https://learn.microsoft.com/en-us/office/dev/add-ins/reference/overview/powerpoint-add-ins-reference-overview). Find out more in the [Office Add-ins platform overview](https://learn.microsoft.com/en-us/office/dev/add-ins/overview/office-add-ins). Also useful: [Explore APIs with Script Lab](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/develop-overview#explore-apis-with-script-lab).

## Develop locally

In order to test your changes to the Add-in locally, you have to sideload it into PowerPoint. This essentially means providing PowerPoint with a `manifest.xml` file where the destinations point to the local dev server instead of the public GitHub Pages domain.

### Sideload into PowerPoint

This is also described in the [Sideload an Office Add-in for testing](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/test-debug-office-add-ins#sideload-an-office-add-in-for-testing) docs.

1. PowerPoint → File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs.
2. Add a Shared Folder catalog pointing to the folder where `manifest.xml` lives and check "Show in Menu."<br>
<sub>This step requires the folder to be shared as a network folder, so the Catalog URL should be something like `\\your-device\path\to\repo\`. On Windows, you can share a folder by right-clicking it in File Explorer, selecting "Properties", going to the "Sharing" tab, and clicking "Advanced Sharing..." and "Share this folder". Follow the prompts to share the folder on your network. If you're using WSL, you're lucky since URLs that start with `\\wsl.localhost\` seem to work fine, even without having to configure any network sharing.</sub>
3. Restart PowerPoint → "Home" ribbon → Add-ins → More Add-ins → Shared Folder → pick the PPTypst Add-in.

### Serve locally

We use [Vite](https://vite.dev/guide/) as build tool.

```sh
npm install
npm run dev
```

Note that Office Add-ins require the secure-context `https` (not just `http`), even for local development. So you have to add a `localhost.key` and `localhost.crt` file to the `web/certs/` folder (see also `.config/vite.config.js`). To create and trust a `localhost` certificate on your machine, you may want to use `mkcert`:

```sh
mkcert -install
mkcert -cert-file web/certs/localhost.crt -key-file web/certs/localhost.key localhost
```

If you're on WSL, follow [these steps](https://github.com/microsoft/WSL/issues/3161#issuecomment-451863149). For more background, see [this guide](https://240dc.com/wsl2-add-a-local-ssl-certificate-with-mkcert/), but rather execute the commands as shown in the first link. It's a bit tedious, but you will get there.

Playwright tests do not need those certificates. The local and CI test setup starts Vite over plain `http` because the Office APIs are mocked in that scenario.

### Debug

In PowerPoint, press `Ctrl+Shift+I` when the focus is on the Add-in task pane. This will open the dev console of the embedded web view where you can see network requests, the console output etc.

### Validate manifest

```sh
npm run validate-manifest
```

## Playwright Tests

```sh
# Install necessary dependencies first
npx playwright install-deps chromium
npx playwright install chromium

# Run tests (or even easier, just use the Playwright VSCode extension)
# Note that a dedicated test webserver will automatically be started for the tests,
# see the playwright.config.ts for details.
npm run test
```

## Test production-like environment

All you have to do is sideload the `manifest.prod.xml` instead of the manifest used for local development `manifest.xml`. To do so, copy the `manifest.prod.xml` to some `tmp/` folder that you have added to the PowerPoint Trust Center (see above) and rename the file to `manifest.xml` such that PowerPoint recognizes it.

If you have used another manifest beforehand, clear the office cache as described [here](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/clear-cache#manually-clear-the-cache-in-excel-word-and-powerpoint). Essentially, you just have to delete the entire content of this folder (on Windows):

```sh
%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\
```

The production manifest has URLs configured to point to the site hosted on GitHub Pages. This way, you can see if everything works fine. All we ship to the PowerPoint Marketplace is the Manifest file in the end.

## Useful links

- [PowerPoint JS API](https://learn.microsoft.com/en-us/javascript/api/powerpoint) (Preview) & [v10](https://learn.microsoft.com/en-us/javascript/api/powerpoint?view=powerpoint-js-1.10)
