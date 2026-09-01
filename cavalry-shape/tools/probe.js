/**
 * Paste into Cavalry's JavaScript Editor and run, with the PPTypst plug-in
 * installed. Answers the questions the docs do not, and prints a verdict per
 * line. It creates one throwaway layer and deletes it again.
 *
 *   0. Did Cavalry register the layer type at all, and under what name?
 *   1. Which probe variants registered (see scripts/make-probe-plugins.mjs)?
 *      That bisects a rejected definitions.json down to one attribute.
 *   2. Do `string` attributes work on a JS Shape, and how big can they get?
 *   3. Roughly how long does a rebuild of a real formula take?
 *   4. Where did the plug-in and its assets actually land?
 *
 * Cavalry indexes plug-ins at start-up, so restart it after installing.
 */

// Cavalry namespaces third-party layer types as `<author>::<type>`.
const AUTHOR = 'pptypst'
const TYPE = `${AUTHOR}::pptypstFormula`
const ATTRS = {
    source: 'typstSource',
    fontSize: 'typstFontSize',
    geometry: 'typstGeometry',
    colours: 'typstColours',
}

function report(label, ok, detail) {
    console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  -- ${detail}` : ''}`)
}

/* 4. Installation ---------------------------------------------------------- */

const pluginDir = `${api.getAppDataFolder()}/Third-Party/Plugins/PPTypst`
report('plug-in folder', api.isDirectory(pluginDir), pluginDir)
report('assets/vendor', api.isDirectory(`${pluginDir}/assets/vendor`), 'needed by the panel')
console.log(`      scriptLocation: ${ui.scriptLocation || '(blank -- pasted, not installed)'}`)

/* 0. Registration ---------------------------------------------------------- */

// `api.getAllLayerTypes` is the ground truth: if a type is missing here,
// Cavalry rejected or never read its definitions.json, and `api.create` will
// quietly return nothing.
const allTypes = api.getAllLayerTypes(true) || []
const known = {}
for (const entry of allTypes) known[entry.type] = entry.name

console.log(`      Cavalry knows ${allTypes.length} layer types.`)
report(`'${TYPE}' is registered`, TYPE in known, known[TYPE] || 'not in getAllLayerTypes')

const ours = Object.keys(known).filter((type) => /typst|formula/i.test(type))
console.log(`      types matching /typst|formula/: ${ours.length ? ours.join(', ') : '(none)'}`)

// The bisect variants. Which of these registered narrows a rejected
// definitions.json down to the attribute that caused it.
const VARIANTS = {
    A: 'one double only',
    B: 'A + a string attribute',
    C: 'A + the material stanza',
    D: 'A + a string that triggers polyMesh',
}
console.log('      probe variants:')
for (const id of Object.keys(VARIANTS)) {
    const type = `${AUTHOR}::pptypstProbe${id}`
    console.log(`        ${id}  ${type in known ? 'registered  ' : 'MISSING     '}${VARIANTS[id]}`)
}

// What is actually in the shape sandbox? `console.log` from inside a JS Shape
// does not reach this console, so variant A reports it as a bit mask baked into
// its height. See scripts/make-probe-plugins.mjs.
const SANDBOX_BITS = ['api', 'ui', 'ctx', 'def', 'ctx.saveObject', 'console']
const sandboxProbe = api.create(`${AUTHOR}::pptypstProbeA`, 'Sandbox check')
if (!sandboxProbe) {
    console.log('      (install dist/probe/PPTypstProbeA to see what the shape sandbox holds)')
} else {
    const bits = Math.round(api.getBoundingBox(sandboxProbe, true).height) - 1
    const present = SANDBOX_BITS.filter((_, i) => bits & (1 << i))
    const absent = SANDBOX_BITS.filter((_, i) => !(bits & (1 << i)))
    console.log(`      JS Shape sandbox has: ${present.join(', ') || '(nothing?!)'}`)
    console.log(`                   lacks:   ${absent.join(', ') || '(nothing)'}`)
    api.deleteLayer(sandboxProbe)
}

/* 1. Layer type ------------------------------------------------------------ */

let layerId = ''
try {
    layerId = api.create(TYPE, 'PPTypst probe')
} catch (error) {
    report(`api.create('${TYPE}')`, false, String(error))
}

if (!layerId) {
    console.log('')
    console.log('Could not create the layer. Read the variants above:')
    console.log('  no variant registered   -> plug-ins are not being loaded at all;')
    console.log('                             restart Cavalry after installing.')
    console.log('  A registered, B did not -> `string` is not a legal attribute type;')
    console.log('                             the geometry cannot live in an attribute.')
    console.log('  B registered, D did not -> a string cannot drive the polyMesh trigger.')
    console.log('  A and C differ          -> the `material` stanza is at fault.')
    console.log('  all registered          -> something else in plugin/definitions.json is.')
} else {
    report(`api.create('${TYPE}')`, true, `layerId ${layerId}`)
    report('getLayerType round-trips', api.getLayerType(layerId) === TYPE, api.getLayerType(layerId))

    /* 2. String attributes ------------------------------------------------- */

    const short = '$ integral_0^1 x^2 dif x = 1/3 $'
    api.set(layerId, { [ATTRS.source]: short })
    report(
        'string attribute round-trips',
        api.get(layerId, ATTRS.source) === short,
        JSON.stringify(api.get(layerId, ATTRS.source))
    )

    // The geometry payload for a one-line formula is ~9 KB; a paragraph of
    // maths is comfortably ten times that. Find where (if anywhere) it breaks.
    let largest = 0
    for (const size of [1e3, 1e4, 1e5, 1e6]) {
        const blob = 'x'.repeat(size)
        api.set(layerId, { [ATTRS.geometry]: blob })
        const back = api.get(layerId, ATTRS.geometry)
        if (typeof back === 'string' && back.length === size) largest = size
        else break
    }
    report('large string attribute', largest >= 1e5, `survived ${largest} characters`)
    api.set(layerId, { [ATTRS.geometry]: '' })

    api.set(layerId, { [ATTRS.fontSize]: 42, [ATTRS.colours]: true })
    const fontSize = api.get(layerId, ATTRS.fontSize)
    const colours = api.get(layerId, ATTRS.colours)
    report(
        'double + bool attributes',
        fontSize === 42 && colours === true,
        `fontSize=${fontSize} colours=${colours}`
    )

    /* 3. Rebuild cost ------------------------------------------------------ */

    // A stand-in payload of the right order of magnitude: 400 short outlines.
    const paths = []
    for (let i = 0; i < 400; i++) {
        paths.push({ d: `M ${i} 0 L ${i + 1} 1 Q ${i} 2, ${i + 1} 3 Z`, f: '#000000' })
    }
    const payload = JSON.stringify({ v: 1, w: 1000, h: 100, p: paths })

    // Two writes: the second is what a scrub or an unrelated re-evaluation
    // costs, and shows whether anything is being cached between them.
    const started = Date.now()
    api.set(layerId, { [ATTRS.geometry]: payload })
    const first = Date.now() - started

    const restarted = Date.now()
    api.set(layerId, { [ATTRS.colours]: false, [ATTRS.geometry]: payload })
    const second = Date.now() - restarted

    const bbox = api.getBoundingBox(layerId, true)
    console.log(
        `      rebuild of ${paths.length} outlines (${payload.length} chars): `
            + `${first} ms, then ${second} ms; bbox ${bbox.width.toFixed(1)} x ${bbox.height.toFixed(1)}`
    )
    report(
        'the shape actually drew something',
        bbox.width > 0 && bbox.height > 0,
        'a zero box means formula.js returned an empty mesh'
    )
    console.log(
        `      bbox centre: ${bbox.centre.x.toFixed(1)}, ${bbox.centre.y.toFixed(1)} `
            + '(should sit on the layer position, i.e. the outlines are centred)'
    )

    api.deleteLayer(layerId)
    console.log('Probe layer deleted.')
}
