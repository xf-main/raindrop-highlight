import type { RaindropHighlight } from '@/types'
import { aim, rangeToText, rangePosition } from '@/marker'

export type Store = {
    highlights: RaindropHighlight[],
    hide_new_toolbar: boolean,
    pro: boolean,
    nav: boolean,
    readonly draft: RaindropHighlight|undefined,

    find: (range: Range)=>RaindropHighlight|undefined,
    upsert: (highlight: RaindropHighlight, range?: Range)=>void,
    remove: (highlight: RaindropHighlight)=>void,

    setDraft: (highlight: RaindropHighlight, range?: Range)=>void,
    draftSubmit: ()=>void,
    draftCancel: ()=>void
}

export function createStore(
    onAdd: (highlight: RaindropHighlight)=>void,
    onUpdate: (highlight: RaindropHighlight)=>void,
    onRemove: (highlight: { _id: RaindropHighlight['_id'] })=>void
): Store {
    //state
    let highlights: RaindropHighlight[] = $state([])
    let hide_new_toolbar = $state(false)
    let pro = $state(false)
    let nav = $state(false)
    let draft: RaindropHighlight|undefined = $state(undefined)

    //position (occurrence index) costs a full-document scan, so it is resolved
    //only when a new highlight is actually saved, from the selection it came from
    function resolvePosition(item: RaindropHighlight, range?: Range) {
        if (item._id != undefined || item.position != undefined || !range) return
        const position = rangePosition(range)
        if (position != undefined) item.position = position
    }

    //actions
    function find(range: Range): RaindropHighlight|undefined {
        //existings
        const _id = aim(range)
        if (_id) return highlights.find(h=>h._id == _id)

        //new
        const text = rangeToText(range).trim()
        if (!text) return
        return { text }
    }

    function upsert(highlight: RaindropHighlight, range?: Range) {
        const item: RaindropHighlight = {
            ...(typeof highlight._id == 'string' ? { _id: highlight._id } : {}),
            ...(typeof highlight.text == 'string' ? { text: highlight.text } : {}),
            ...(typeof highlight.note == 'string' ? { note: highlight.note } : {}),
            ...(typeof highlight.position == 'number' ? { position: highlight.position } : {}),
            color: highlight.color || 'yellow',
            //ignore all unknown fields (otherwise breaks ios)
        }
        if (!item.text?.trim()) return

        resolvePosition(item, range)

        const textKey = item.text.toLocaleLowerCase().trim()
        const index = highlights.findIndex(h=>
            (item._id != undefined && h._id == item._id) ||
            (
                h.text?.toLocaleLowerCase().trim() === textKey &&
                (h.position ?? 0) == (item.position ?? 0)
            )
        )

        if (index != -1){
            item._id = highlights[index]._id
            //an update without explicit position keeps the occurrence it was anchored to
            if (item.position == undefined && typeof highlights[index].position == 'number')
                item.position = highlights[index].position
            highlights[index] = item
            onUpdate(item)
        } else {
            highlights.push(item)
            onAdd(item)
        }
    }

    function remove({ _id }: RaindropHighlight) {
        highlights = highlights.filter(h=>h._id != _id)
        onRemove({ _id })
    }

    //draft actions
    function setDraft(highlight: RaindropHighlight, range?: Range) {
        //selection may be gone by the time the draft is submitted, so resolve position now
        const item = { ...highlight }
        resolvePosition(item, range)
        draft = JSON.parse(JSON.stringify(item))
    }

    function draftSubmit() {
        if (!draft) return
        upsert(draft)
        draft = undefined
    }

    function draftCancel() {
        draft = undefined
    }

    return {
        get highlights() { return highlights },
        set highlights(value: RaindropHighlight[]) { highlights = value },
        get pro() { return pro },
        set pro(value: boolean) { pro = value },
        get nav() { return nav },
        set nav(value: boolean) { nav = value },
        get hide_new_toolbar() { return hide_new_toolbar },
        set hide_new_toolbar(value: boolean) { hide_new_toolbar = value },
        get draft() { return draft },

        find,
        upsert,
        remove,

        setDraft,
        draftSubmit,
        draftCancel
    }
}
