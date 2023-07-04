# y-localforage #

a simple [Yjs](https://docs.yjs.dev/) storage provider using [localForage](https://localforage.github.io/localForage/) for persistence

[Yjs](https://github.com/yjs/yjs) provides a complete ecosystem for (persisting and) sharing "Conflict-free replicated data types" (CRDT) among multiple clients using a variety of persistence and communication providers. [LocalForage](https://github.com/localForage/localForage) is a simple storage library for JavaScript which wraps IndexedDB, WebSQL and other storage technologies in a common, `localStorage`-like API.

This module implements a simple Yjs storage provider for browser-based applications which uses an arbitrary `localForage` store for persistance - this means: **if there is a `localForage` "driver", you can use this module to instantiate a Yjs provider for it**. In addition to other database providers it

* contains an `isSynced` property which reflects the main document's own current synchronization status,
* and an `isFullySynced` property which includes the synchronization state of any subdocs,
* emits additional events (`sync-started`, `sync-continued`, `sync-finished` and `sync-aborted`) which inform about synchronization progress for the main document,
* and `subdoc-synced` which informs about a given subdoc being successfully synchronized,
* sends a `load` event to the main doc and any subdoc as soon as that `Y.Doc` has been fully loaded from persistence,
* automatically persists any subdocs as well, and
* includes rudimentary error handling which breaks down the provider upon failure (which means that you have to re-incarnate the provider after the cause for this failure has been removed).

`y-localforage` always tries to keep your data safe and not to overwrite or even delete previously written updates. Even a failure normally only means that the last update could not be written but all the previous ones are still safe.

> **Important: do not use the "copy" feature for `Y.Doc`s, i.e., do not create a `Y.Doc` instance with the same GUID as another one - `Y.Doc` copies do not "synchronize" as described in the docs anyway.**

**NPM users**: please consider the [Github README](https://github.com/rozek/y-localforage/blob/main/README.md) for the latest description of this package (as updating the docs would otherwise always require a new NPM package version)

> Just a small note: if you like this work and plan to use it, consider "starring" this repository (you will find the "Star" button on the top right of this page), so that I know which of my repositories to take most care of.

## Installation ##

`y-localforage` may be used as an ECMAScript module (ESM), a CommonJS or AMD module or from a global variable.

You may either install the package into your build environment using [NPM](https://docs.npmjs.com/) with the command

```
npm install y-localforage localforage
```

or load the plain script files directly

```html
<script src="https://unpkg.com/localforage"></script>
<script src="https://unpkg.com/y-localforage"></script>
```

## Access ##

How to access the package depends on the type of module you prefer

* ESM (or Svelte): `import { LocalForageProvider } from 'y-localforage'`
* CommonJS: `const LocalForageProvider = require('y-localforage')`
* AMD: `require(['y-localforage'], (LocalForageProvider) => {...})`

Alternatively, you may access the global variable `LocalForageProvider` directly.

Note for ECMAScript module users: all module functions and values are exported individually, thus allowing your bundler to perform some "tree-shaking" in order to include actually used functions or values (together with their dependencies) only.

## Usage within Svelte ##

For Svelte, it is recommended to import the package in a module context. From then on, its exports may be used as usual:

```html
<script context="module">
  import * as Y from 'yjs'
  import { LocalForageProvider } from 'y-localforage'
</script>

<script>
  localforage.config({
    driver: [localforage.INDEXEDDB, localforage.WEBSQL]
  })

  localforage.ready(function () {
    const DocStore = localforage.createInstance({
      name:'Yjs-Persistence'
    })

    const sharedDoc   = new Y.Doc()
    const Persistence = new LocalForageProvider(DocStore, sharedDoc)
    ...
  })
</script>
```

## Usage as ECMAscript, CommonJS or AMD Module (or as a global Variable) ##

Let's assume that you already "required" or "imported" (or simply loaded) the module according to your local environment. In that case, you may use it as follows:

```javascript
  ...
  localforage.config({
    driver: [localforage.INDEXEDDB, localforage.WEBSQL]
  })

  localforage.ready(function () {
    const DocStore = localforage.createInstance({
      name:'Yjs-Persistence'
    })

    const sharedDoc   = new Y.Doc()
    const Persistence = new LocalForageProvider(DocStore, sharedDoc)
    ...
  })
```

## API Reference ##

The following documentation shows method signatures as used by TypeScript - if you prefer plain JavaScript, just ignore the type annotations.

### Constructor ###

* **`LocalForageProvider (Store:any, sharedDoc:Y.Doc, UpdateLimit:number = 500)`**<br>creates a new instance of `LocalForageProvider` which synchronizes the given `sharedDoc` on the given localForage `Store`. `UpdateLimit` indicates how many updates should be appended to the `Store` before they will be compacted into a single one

### Properties ###

* **`isSynced`**<br>returns `true` while the initially given `Y.Doc` and this provider are in-sync - or `false` otherwise. Please note, that `isSynced` does not inform about the synchronization status of any "subdocs"
* **`isFullySynced`**<br>returns `true` while the initially given `Y.Doc` and all its "subdocs" are in-sync - or `false` otherwise

### Methods ###

* **`SubDocIsSynced (SubDoc:Y.Doc):boolean`**<br>returns `true` while the given `SubDoc` (of this provider's shared `Y.Doc`) and its provider are in-sync - or `false` otherwise. `SubDocIsSynced` also returns `false` if `SubDoc` is not a subdoc of this provider's shared `Y.Doc`
* **`async destroy ():Promise<void>`**<br>stops any activities of this provider and deletes any persistence entries of this provider's shared `Y.Doc` and its subdocs. **Warning**: this method completely destroys any written data and cannot be undone!

### Events ###

* **`on('sync-started', Handler:(Provider:LocalForageProvider, Progress:number) => void)`**<br>the `sync-started` event is fired whenever a synchronization between this provider and its associated `Y.Doc` has begun. `Provider` contains a reference to this provider and `Progress` is always `0.0`
* **`on('sync-continued', Handler:(Provider:LocalForageProvider, Progress:number) => void)`**<br>the `sync-continued` event may be fired several times while a synchronization between this provider and its associated `Y.Doc` is in progress if this synchronization can not be completed instantaneously. `Provider` contains a reference to this provider and `Progress` is a number between `0.0` and `1.0` indicating how much has already been synchronized. Please note: depending on how many new updates are generated (in contrast to how many have been synchronized during that time) the reported `Progress` may not always increase but may even decrease sometimes
* **`on('sync-finished', Handler:(Provider:LocalForageProvider, Progress:number) => void)`**<br>the `sync-finished` event is fired whenever a synchronization between this provider and its associated `Y.Doc` has finished. `Provider` contains a reference to this provider and `Progress` is always `1.0`
* **`on('sync-aborted', Handler:(Provider:LocalForageProvider, Progress:number) => void)`**<br>the `sync-aborted` event is fired when a synchronization between this provider and its associated `Y.Doc` has been aborted (e.g., because the space on localStorage was exhausted or the provider was destroyed). `Provider` contains a reference to this provider and `Progress` is always `1.0`. After such an event, the `Provider` remains unusable and has to be created again
* **`on('synced', Handler:(Provider:LocalForageProvider) => void`**<br>the `synced` event works like in any other Yjs provider and is fired whenever (initially or after an update to the associated `Y.Doc`) this provider gets in-sync again
* **`on('subdoc-synced', Handler:(Provider:LocalForageProvider, SubDoc:Y.Doc) => void`**<br>the `subdoc-synced` event is fired whenever any "subdoc" of this provider's main `Y.Doc` has been successfully synchronized. `Provider` contains a reference to this provider and `SubDoc` a reference to the synchronized subdoc

## Build Instructions ##

You may easily build this package yourself.

Just install [NPM](https://docs.npmjs.com/) according to the instructions for your platform and follow these steps:

1. either clone this repository using [git](https://git-scm.com/) or [download a ZIP archive](https://github.com/rozek/y-localforage/archive/refs/heads/main.zip) with its contents to your disk and unpack it there 
2. open a shell and navigate to the root directory of this repository
3. run `npm install` in order to install the complete build environment
4. execute `npm run build` to create a new build

You may also look into the author's [build-configuration-study](https://github.com/rozek/build-configuration-study) for a general description of his build environment.

## License ##

[MIT License](LICENSE.md)
