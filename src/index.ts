import '@webcomponents/custom-elements'
import { createStore, type Store } from '@/store.svelte'
import { scrollToId, getCurrentRange, resetCurrentRange } from '@/marker'
import '@/ui/index.svelte'
import ipc from '@/ipc'
import type { RaindropHighlight } from '@/types'

const ui = document.createElement('rdh-ui') as HTMLElement & { store: Store }

(async()=>{
    //init store first: ipc can replay queued events synchronously before returning
    let send: Awaited<ReturnType<typeof ipc>> | undefined
    const store = createStore(
        highligh=>
            send?.({ type: 'RDH_ADD', payload: highligh }),
        highligh=>
            send?.({ type: 'RDH_UPDATE', payload: highligh }),
        ({ _id })=>
            send?.({ type: 'RDH_REMOVE', payload: { _id } })
    )
    ui.store = store

    //receive events from ipc
    send = await ipc(event=>{
        switch(event.type) {
            case 'RDH_APPLY':
                if (Array.isArray(event.payload))
                    store.highlights = event.payload.filter((h): h is RaindropHighlight =>
                        !!h && typeof h == 'object' && typeof h.text == 'string' && !!h.text.trim()
                    )
            break

            case 'RDH_CONFIG':
                if (typeof event.payload.pro == 'boolean')
                    store.pro = event.payload.pro

                if (typeof event.payload.nav == 'boolean')
                    store.nav = event.payload.nav

                if (typeof event.payload.hide_new_toolbar == 'boolean')
                    store.hide_new_toolbar = event.payload.hide_new_toolbar

                //insert or remove ui
                if (typeof event.payload.enabled == 'boolean') {
                    if (event.payload.enabled === true) {
                        if (!document.body.contains(ui))
                            document.body.appendChild(ui)
                    } else {
                        if (document.body.contains(ui))
                            document.body.removeChild(ui)
                    }
                }
            break

            case 'RDH_SCROLL':
                if (typeof event.payload._id == 'string')
                    scrollToId(event.payload._id)
            break

            case 'RDH_ADD_SELECTION':{
                const range = getCurrentRange()
                if (!range) return
                const highligh = store.find(range)
                if (!highligh) return
                store.upsert({ ...highligh, ...(event.payload||{}) }, range)
                resetCurrentRange()
            }
            break

            case 'RDH_NOTE_SELECTION':{
                const range = getCurrentRange()
                if (!range) return
                const highligh = store.find(range)
                if (!highligh) return
                store.setDraft(highligh, range)
                resetCurrentRange()
            }
            break
        }
    })

    //ready to receive events
    send({ type: 'RDH_READY', payload: { url: location.href } })
})()
