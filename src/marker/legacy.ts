import type { RaindropHighlight } from '@/types'
import { colors } from '@/config'
import findTextRanges, { textNodeFilter } from './find-text-ranges'

//per-instance prefix; NAMESPACE matches every instance (a previous script copy
//can survive re-injection after an extension reload and leave marks behind)
const cssprefix = `rh-${new Date().getTime()}`
const NAMESPACE = /^rh-\d{10,}$/

function allMarks(): HTMLElement[] {
    return ([...document.body.querySelectorAll('mark[class^="rh-"]')] as HTMLElement[])
        .filter(mark => NAMESPACE.test(mark.className))
}

//unwrap marks preserving original nodes (never through innerText/outerHTML:
//that would parse page text as HTML and destroy nested elements)
function unwrap(marks: Iterable<HTMLElement>) {
    const parents = new Set<Node>()
    for(const mark of marks) {
        if (mark.parentNode) parents.add(mark.parentNode)
        mark.replaceWith(...mark.childNodes)
    }
    //merge text nodes fragmented by previous wrapping
    parents.forEach(parent => parent.normalize())
}

//text nodes intersecting the range, in document order
function textNodesInRange(range: Range): Text[] {
    if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE)
        return [range.startContainer as Text]

    const result: Text[] = []
    //cross-block ranges can span <style>/<script> between matched blocks — wrapping their text would break them
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, textNodeFilter)
    let node: Node | null
    while (node = walker.nextNode()) {
        if (range.intersectsNode(node))
            result.push(node as Text)
        //past the range end — nothing further can intersect
        else if (result.length)
            break
    }
    return result
}

let sweptStaleStyles = false

export function apply(highlights: RaindropHighlight[]) {
    //including marks left by a previous script instance
    const existing = allMarks()

    if (!highlights.length && !existing.length)
        return

    //reset
    unwrap(existing)

    //stale style elements can only come from a previous instance — sweep once
    if (!sweptStaleStyles) {
        sweptStaleStyles = true
        document.head.querySelectorAll('style[id^="rh-"]').forEach(elem => {
            if (elem.id != cssprefix && NAMESPACE.test(elem.id)) elem.remove()
        })
    }

    //global style
    const cssRules = []

    //find text ranges
    const textsRanges = findTextRanges(highlights.map(({ text }) => text||''))

    //wrap each text node of the matched range in its own mark:
    //extracting a cross-block range into a single inline element would rip content out of paragraphs
    for(const i in highlights) {
        const ranges = textsRanges[i]
        if (!ranges.length) continue

        const { _id, color, position=0 } = highlights[i]
        const range = ranges[position] || ranges[0]
        //local highlights have no _id until the host syncs them back
        const id = typeof _id == 'string' ? _id : `local-${i}`

        for(const textNode of textNodesInRange(range)) {
            const sub = document.createRange()
            sub.setStart(textNode, textNode === range.startContainer ? range.startOffset : 0)
            sub.setEnd(textNode, textNode === range.endContainer ? range.endOffset : (textNode.nodeValue?.length || 0))
            if (sub.collapsed || !sub.toString().trim()) continue

            const mark = document.createElement('mark')
            mark.className = cssprefix
            mark.setAttribute('data-id', id)
            //safe: sub is always within a single text node, so no partial element containment
            sub.surroundContents(mark)
        }

        cssRules.push(`
            .${cssprefix}[data-id="${CSS.escape(id)}"] {
                all: unset;
                display: inline-block !important;
                background-color: white !important;
                background-image: linear-gradient(to bottom, ${highlightColor(color)} 0, ${highlightColor(color)} 100%) !important;
                color: black !important;
            }
        `)
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
    unwrap(allMarks())
    document.getElementById(cssprefix)?.remove()
}

export function scrollToId(highlightId: string) {
    const mark = document.body.querySelector(`.${cssprefix}[data-id="${CSS.escape(highlightId)}"]`)
    if (!mark) return

    mark.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function aim(range: Range): RaindropHighlight['_id']|undefined {
    const element = range.commonAncestorContainer.nodeType == Node.ELEMENT_NODE ?
        range.commonAncestorContainer as HTMLElement :
        range.commonAncestorContainer.parentElement

    const mark = element?.closest(`.${cssprefix}`) as HTMLElement | null
    if (!mark) return

    //selection must cover the whole highlight text; real selections have text-node
    //granularity boundaries, so compare covered content instead of boundary points
    if (!range.collapsed && range.toString().trim() != (mark.textContent || '').trim()) return

    return mark.getAttribute('data-id') || undefined
}

function highlightColor(color?: string) {
    let hex = colors.get(color!) || color

    //expand #abc to #aabbcc
    if (hex && /^#[0-9a-fA-F]{3}$/.test(hex))
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`

    //named colors, invalid values, missing color -> default (converter only handles 6-digit hex)
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex))
        hex = colors.get('yellow')!

    return convertHexToRgba(hex, .4)
}

function convertHexToRgba(hex: string, opacity: number) {
    const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
