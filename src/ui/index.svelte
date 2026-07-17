<svelte:options customElement="rdh-ui" />

<script lang="ts">
    import type { Store } from '@/store.svelte'
    import { apply, cleanup } from '@/marker'
    import Toolbar from './toolbar.svelte'
    import Modal from './modal.svelte'
    import Navigation from './navigation.svelte'
    import MobileZoomLevel from './mobile-zoom-level.svelte'

    let { store } : { store: Store } = $props()

    //render highlights
    $effect(() => { apply(store.highlights) })

    //late content (images, embeds) can shift layout — re-apply a while after load
    let loadTimeout: number|undefined
    function scheduleReapply() {
        clearTimeout(loadTimeout)
        loadTimeout = setTimeout(() => apply(store.highlights), 3000) as any as number
    }

    //re-render when window is loaded/navigated
    function onWindowLoad() {
        apply(store.highlights)
        scheduleReapply()
    }

    $effect(()=>{
        //already loaded at mount: the render effect above just applied,
        //and the window 'load' event will never fire — only schedule the delayed pass
        if (document.readyState == 'complete') scheduleReapply()

        //unmount: also cancel the delayed re-apply, otherwise it re-renders highlights after cleanup
        return () => {
            clearTimeout(loadTimeout)
            cleanup()
        }
    })
</script>

<svelte:window onload={onWindowLoad} onpopstate={onWindowLoad} />

<MobileZoomLevel>
    <Toolbar {store} />
    <Modal {store} />
    <Navigation {store} />
</MobileZoomLevel>