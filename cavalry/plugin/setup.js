/**
 * Runs when a "PPTypst" node is created (Create/Add menu, a preset, or a
 * script). Full script context: `api`, `ui`, `setup.layerId`.
 *
 * Creating the node is treated as "launch PPTypst": it runs the installed
 * window script (copied into the Scripts folder by welcome.js), which builds
 * and shows the editor window. The node is left in the scene as a visible
 * launch point; it is inert and can be deleted.
 */

function scriptsDir() {
    const base = api.getAppDataFolder()
    for (const cand of [base + '/Scripts', base + '/Cavalry/Scripts']) {
        if (api.isDirectory(cand)) return cand
    }
    return base + '/Scripts'
}

const script = scriptsDir() + '/PPTypst.js'
if (api.isFile(script)) {
    api.load(script)
} else {
    console.log(
        'PPTypst: window script not found at ' + script +
            ' — re-install the plug-in, then open Window ▸ Scripts ▸ PPTypst.',
    )
}
