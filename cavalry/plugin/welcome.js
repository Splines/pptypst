/**
 * Runs once when the PPTypst plug-in is dropped onto the Cavalry window
 * (and again on every update). Full script context: `api`, `ui`, and
 * `install.fromUpdate`.
 *
 * The plug-in registers no layer type. Its whole job is to copy the PPTypst
 * window script and the vendored wasm + fonts out of the installed plug-in
 * folder and into the Cavalry *Scripts* folder, so that afterwards PPTypst
 * shows up under Window > Scripts like any hand-installed script -- and the
 * `<script>/pptypst_assets/vendor` convention in src/config.ts resolves.
 *
 * See scripts/pack-plugin.mjs for the folder this reads from.
 */

const SCRIPT = 'PPTypst.js'
// Trailing "_assets" makes Cavalry hide the folder in the Scripts menu.
const ASSETS = 'pptypst_assets'

/** The folder this plug-in was installed into. */
function pluginDir() {
    // Scripts Cavalry runs from disk get their folder in `ui.scriptLocation`.
    if (ui.scriptLocation && api.isFile(ui.scriptLocation + '/' + SCRIPT)) {
        return ui.scriptLocation
    }
    // Otherwise look through the third-party plug-ins folder for our payload.
    const base = api.getAppDataFolder()
    const roots = [
        base + '/Third-Party/Plugins',
        base + '/Cavalry/Third-Party/Plugins',
    ]
    for (const root of roots) {
        if (!api.isDirectory(root)) continue
        for (const dir of api.listDirectory(root)) {
            if (api.isFile(dir + '/' + SCRIPT) && api.isDirectory(dir + '/' + ASSETS)) {
                return dir
            }
        }
    }
    throw new Error('PPTypst: could not locate the installed plug-in folder.')
}

/** The user's Cavalry Scripts folder, created if it does not exist yet. */
function scriptsDir() {
    const base = api.getAppDataFolder()
    for (const cand of [base + '/Scripts', base + '/Cavalry/Scripts']) {
        if (api.isDirectory(cand)) return cand
    }
    const dir = base + '/Scripts'
    api.makeFolder(dir)
    return dir
}

/** Copy `from` to `to`, replacing any existing file (copyFilePath won't overwrite). */
function put(from, to) {
    if (api.isFile(to)) api.deleteFilePath(to)
    api.copyFilePath(from, to)
}

const src = pluginDir()
const dst = scriptsDir()

put(src + '/' + SCRIPT, dst + '/' + SCRIPT)

const vendorFrom = src + '/' + ASSETS + '/vendor'
const vendorTo = dst + '/' + ASSETS + '/vendor'
api.makeFolder(vendorTo)
for (const file of api.listDirectoryRecursive(vendorFrom)) {
    if (api.isFile(file)) {
        put(file, vendorTo + '/' + api.getFileNameFromPath(file, true))
    }
}

ui.setTitle('PPTypst')
ui.add(
    new ui.Label(
        (install.fromUpdate ? 'PPTypst updated.' : 'PPTypst installed.') +
            '\n\nOpen it from  Window ▸ Scripts ▸ PPTypst .\n\n' +
            'Type Typst, watch the preview, then press Insert to import it as\n' +
            'vector layers. Select a formula in the scene to load it back for\n' +
            'editing; Insert then becomes Update.',
    ),
)
ui.addStretch()
ui.setMinimumWidth(440)
ui.show()
