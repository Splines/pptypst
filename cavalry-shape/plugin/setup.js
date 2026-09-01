/**
 * Runs when a Typst Formula layer is created (from the Create menu, a preset,
 * or the PPTypst window). Full script context: `api`, `ui`, `setup.layerId`.
 *
 * It deliberately does *not* open the PPTypst window. The window creates
 * layers itself, so opening from here would pop a second window on every
 * Insert.
 */

console.log(
    'PPTypst: Typst Formula layer created. Open Window > Scripts > PPTypst to typeset into it.'
)
