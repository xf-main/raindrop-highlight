import type { RaindropHighlight } from '@/types'
import { colors } from '@/config'
import findTextRanges from './find-text-ranges'
import SafeCSSHighlights from '@/modules/safe-css-highlights'

//per-instance prefix; NAMESPACE matches every instance (a previous script copy
//can survive re-injection after an extension reload and leave entries behind)
export const cssprefix = `rh-${new Date().getTime()}-`
const NAMESPACE = /^rh-\d{10,}-/

export const isSupported = 'highlights' in CSS

//_id and color come from external payloads and are interpolated into CSS — allow only safe values
function safeCssId(_id: RaindropHighlight['_id'], fallback: string) {
    return typeof _id == 'string' && /^[\w-]+$/.test(_id) ? _id : fallback
}

function safeCssColor(color: RaindropHighlight['color']) {
    return colors.get(color!) ||
        (color && CSS.supports?.('color', color) ? color : colors.get('yellow')!)
}

let sweptStaleStyles = false

export function apply(highlights: RaindropHighlight[]) {
    if (!highlights.length && !SafeCSSHighlights.hasAny(NAMESPACE))
        return

    //global style
    const cssRules = []

    //clear all our css custom highlights, including ones left by a previous
    //script instance — never page-owned ones
    SafeCSSHighlights.clear(NAMESPACE)

    //stale style elements can only come from a previous instance — sweep once
    if (!sweptStaleStyles) {
        sweptStaleStyles = true
        document.head.querySelectorAll('style[id^="rh-"]').forEach(elem => {
            if (elem.id != cssprefix && NAMESPACE.test(elem.id)) elem.remove()
        })
    }

    if (highlights.length) {
        //find text ranges
        const textsRanges = findTextRanges(
            highlights.map(({ text }) => text || '')
        )

        const scrollHeight = document.documentElement.scrollHeight
        const scrollY = window.scrollY

        //create css custom highlights
        for(const i in highlights) {
            const ranges = textsRanges[i]
            if (!ranges.length) continue

            const { _id, color, note, position=0 } = highlights[i]
            const id = safeCssId(_id, `local-${i}`)
            const cssId = `${cssprefix}${id}`
            const range = ranges?.[position] || ranges[0]

            SafeCSSHighlights.set(cssId, range)

            const pos = range.getBoundingClientRect()
            const highlightColor = safeCssColor(color)

            cssRules.push(`
                ::highlight(${cssId}) {
                    all: unset;
                    background-color: color-mix(in srgb, ${highlightColor}, transparent 60%) !important;
                    ${note ? `text-decoration: underline wavy; -webkit-text-decoration: underline wavy;` : ''}
                    text-decoration-thickness: from-font;
                }

                /* fuck you dark reader */
                html[data-darkreader-scheme="dark"] ::highlight(${cssId}) {
                    color: CanvasText !important;
                }

                /* pdf render */
                .pdf ::highlight(${cssId}) {
                    background-color: color-mix(in srgb, ${highlightColor}, transparent 60%) !important;
                    color: transparent !important;
                }

                :root {
                    /* navigation.svelte reads var(--highlight-{_id}-top): for a pending local
                       highlight _id interpolates to the literal "undefined" on both sides */
                    --highlight-${_id === undefined ? 'undefined' : id}-top: ${(100/scrollHeight * (scrollY + pos.top - 10)).toFixed(2)}%;
                }
            `)
        }
    }

    //apply global style
    const style = (()=>{
        let elem = document.getElementById(cssprefix)
        if (!elem) {
            elem = document.createElement('style')
            elem.id = cssprefix
            document.head.appendChild(elem)
        }
        return elem
    })()

    style.innerHTML = cssRules.join('\n')
}

export function cleanup() {
    document.getElementById(cssprefix)?.remove()
    SafeCSSHighlights.clear(cssprefix)
}

export function scrollToId(highlightId: string) {
    let found = false

    SafeCSSHighlights.forEach((highlight, hid) => {
        if (found) return

        const id = hid.slice(cssprefix.length)
        if (highlightId != id) return

        for(const range of highlight) {
            (range as Range).startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            found = true
            break
        }
    }, cssprefix)
}

export function aim(range: Range): RaindropHighlight['_id']|undefined {
    let overlapped: string|undefined

    SafeCSSHighlights.forEach((highlight, hid) => {
        if (overlapped) return

        for(const highlightRange of highlight) {
            if (overlapped) return

            const ss = range.compareBoundaryPoints(Range.START_TO_START, highlightRange as Range)
            const ee = range.compareBoundaryPoints(Range.END_TO_END, highlightRange as Range)
            if ((ss==0 && ee==0) || (range?.collapsed && ss >= 0 && ee <= 0))
                overlapped = hid.slice(cssprefix.length)
        }
    }, cssprefix)

    return overlapped
}
