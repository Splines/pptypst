/**
 * Splash shown once when the plug-in is installed or updated.
 * `install.fromUpdate` distinguishes the two.
 */

ui.setTitle('PPTypst')

// Guarded: an exception in here happens mid-install, where it is hard to see.
const fromUpdate = typeof install !== 'undefined' && install.fromUpdate

const heading = new ui.Label(fromUpdate ? 'PPTypst updated.' : 'PPTypst installed.')

const body = new ui.Label(
    'Adds a "Typst Formula" shape layer.\n\n'
        + 'The layer holds outlines that have already been typeset — the typesetting '
        + 'itself happens in the PPTypst window, which you open from Window > Scripts.\n\n'
        + 'Type Typst there, watch the preview, then press Insert. Selecting a formula '
        + 'in the scene loads it back for editing; Update rewrites it in place, keeping '
        + 'its position, scale, materials and keyframes.'
)

ui.add(heading)
ui.add(body)
ui.addStretch()
ui.setMinimumWidth(420)
ui.show()
