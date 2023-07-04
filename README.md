# y-localforage #

a simple [Yjs](https://docs.yjs.dev/) storage provider using [localForage](https://localforage.github.io/localForage/) for persistence








## Installation ##

`y-localforage` may be used as an ECMAScript module (ESM), a CommonJS or AMD module or from a global variable.

You may either install the package into your build environment using [NPM](https://docs.npmjs.com/) with the command

```
npm install y-localforage
```

or load the plain script file directly

```html
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
  const sharedDoc   = new Y.Doc()
  const Persistence = new LocalForageProvider(Store, sharedDoc)
  ...
</script>
```

## Usage as ECMAscript, CommonJS or AMD Module (or as a global Variable) ##

Let's assume that you already "required" or "imported" (or simply loaded) the module according to your local environment. In that case, you may use it as follows:

```javascript
  ...
  const Persistence = new LocalForageProvider(Store, sharedDoc)
  ...
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
