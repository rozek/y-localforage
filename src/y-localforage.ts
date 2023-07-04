import * as Y         from 'yjs'
import { Observable } from 'lib0/observable'

// Store Key Pattern: [<subdoc-guid>]@<timestamp>-<n>

namespace LocalForageProvider {
  const GUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@/i

  type SubDocChanges = {
    added:Set<Y.Doc>, removed:Set<Y.Doc>, loaded:Set<Y.Doc>
  }

  export class LocalForageProvider extends Observable<any> {
    private _Store:any
    private _sharedDoc:Y.Doc
    private _SuperProvider?:LocalForageProvider

    private _isBusy:boolean  = false
    private _UpdateLimit:number = 500

    private _pendingUpdates:number   = 0
    private _completedUpdates:number = 0

    private _enqueuedUpdates:Uint8Array[] = []

    private _SubDocMap:Map<Y.Doc,LocalForageProvider> = new Map()

    constructor (
      Store:any, sharedDoc:Y.Doc, UpdateLimit:number = 500,
      SuperProvider?:LocalForageProvider
    ) {
      super()

      this._Store         = Store
      this._sharedDoc     = sharedDoc
      this._SuperProvider = SuperProvider

      this._isBusy      = false
      this._UpdateLimit = UpdateLimit

      this._storeUpdate = this._storeUpdate.bind(this)
      sharedDoc.on('update', this._storeUpdate)

      this._manageSubDocs = this._manageSubDocs.bind(this)
      sharedDoc.on('subdocs', this._manageSubDocs)

      this.destroy = this.destroy.bind(this)
      sharedDoc.on('destroy', this.destroy)

      this._applyStoredUpdates()     // is safe, even while updated or destroyed
    }

  /**** isSynced - is true while this provider and its sharedDoc are in-sync ****/

    get isSynced ():boolean {
      return (this._pendingUpdates === 0)
    }

  /**** isFullySynced - is true while this._sharedDoc and all subdocs are in-sync ****/

    get isFullySynced ():boolean {
      return (
        (this._pendingUpdates === 0) &&
        Array.from(this._SubDocMap.values()).every(
          (SubProvider) => SubProvider.isSynced
        )
      )
    }

  /**** SubDocIsSynced - is true while the given SubDoc is in-sync ****/

    public SubDocIsSynced (SubDoc:Y.Doc):boolean {
      const SubDocProvider = this._SubDocMap.get(SubDoc)
      return (SubDocProvider != null) && SubDocProvider.isSynced
    }

  /**** destroy - destroys persistence, invalidates provider ****/

    async destroy ():Promise<void> {
      if (this._Store == null) { return }         // provider has been destroyed

      let Store = this._Store
// @ts-ignore allow clearing of "this._Store"
      this._Store = undefined

      this._sharedDoc.off('update',  this._storeUpdate)
      this._sharedDoc.off('subdocs', this._manageSubDocs)
      this._sharedDoc.off('destroy', this.destroy)

      if (! this.isSynced) {
        this._pendingUpdates = 0
        this.emit('sync-aborted',[this,1.0])
      }

      const KeysToDelete = (
        this._SuperProvider == null
        ? await this._StorageKeys()
        : await this._StorageSubKeysFor(this._sharedDoc)
      )

      for (let i = 0, l = KeysToDelete.length; i < l; i++) {
        await Store.removeItem(KeysToDelete[i])
      }
    }

  /**** _applyStoredUpdates - applies all stored (incremental) updates to sharedDoc ****/

    private async _applyStoredUpdates ():Promise<void> {
      this._isBusy = true        // prevents update entries from being persisted
        try {
          this._pendingUpdates = 1 // very bad trick to keep this.isSynced false
            const UpdateKeys = (
              this._SuperProvider == null
              ? await this._StorageKeys()
              : await this._StorageSubKeysFor(this._sharedDoc)
            )
          this._pendingUpdates--                  // compensate trick from above

          if (UpdateKeys.length > 0) {
            this._pendingUpdates += UpdateKeys.length; this._reportProgress()

            for (let i = 0, l = UpdateKeys.length; i < l; i++) {
              if (this._Store == null) { return } // provider has been destroyed

              const Update = await this._Store.getItem(UpdateKeys[i])
              Y.applyUpdate(this._sharedDoc, Update, this)
                                          // updates can be applied in any order
              this._completedUpdates++; this._reportProgress()
            }
            this._sharedDoc.emit('load',[this])         // resolves "whenLoaded"
          } else {
            this._reportProgress()
          }
        } catch (Signal:any) {
          this._breakdownWith(
            'could not restore document from persistence', Signal
          )
        }
      this._isBusy = false              // allows update entries to be persisted

      if (this._enqueuedUpdates.length > 0) {
        this._storeUpdatesAndCompact()
      }
    }

  /**** _storeUpdate - stores a given (incremental) update ****/

    private _storeUpdate (Update:Uint8Array, Origin?:any):void {
      if (this._Store == null) { return }         // provider has been destroyed

      if (Origin !== this) {          // ignore updates applied by this provider
        this._pendingUpdates++; this._reportProgress()

        this._enqueuedUpdates.push(Update)
        if (! this._isBusy) {
          this._storeUpdatesAndCompact()
        }            // never write (and compact!) multiple updates concurrently
      }
    }

  /**** _storeUpdatesAndCompact - stores enqueued updates and compacts ****/

    private async _storeUpdatesAndCompact ():Promise<void> {
      if (this._Store == null) { return }         // provider has been destroyed

      this._isBusy = true
        const UpdateKeys = (
          this._SuperProvider == null
          ? await this._StorageKeys()
          : await this._StorageSubKeysFor(this._sharedDoc)
        )

        while ((this._Store != null) && (this._enqueuedUpdates.length > 0)) {
          try {
            await this._storeNextUpdateAmong(UpdateKeys)
            if (this._Store == null) { return }   // provider has been destroyed
          } catch (Signal) {
            this._breakdownWith(
              'could not persist document update', Signal
            )
          }

          if (UpdateKeys.length >= this._UpdateLimit) {
            try {
              await this._compactUpdates(UpdateKeys)
            } catch (Signal) {
              this._breakdownWith(
                'could not compact document updates', Signal
              )
            }
          }
        }
      this._isBusy = false
    }

  /**** _storeNextUpdateAmong - stores next enqueued updates ****/

    private async _storeNextUpdateAmong (UpdateKeys:string[]):Promise<void> {
      let UpdateKey:string = this._newUpdateKeyAmong(UpdateKeys)
      UpdateKeys.push(UpdateKey)

      await this._Store.setItem(UpdateKey,this._enqueuedUpdates[0])

      this._enqueuedUpdates.shift()
      this._completedUpdates++; this._reportProgress()
    }

  /**** _compactUpdates - compacts the given list of updates ****/

    private async _compactUpdates (UpdateKeys:string[]):Promise<void> {
      const thisHadEnqueuedUpdates = (this._enqueuedUpdates.length > 0)
        this._pendingUpdates -= this._enqueuedUpdates.length
        this._enqueuedUpdates = []      // all enqueued updates will be included

        let CompactKey:string = this._newUpdateKeyAmong(UpdateKeys)

        await this._Store.setItem(CompactKey,Y.encodeStateAsUpdate(this._sharedDoc))
        if (this._Store == null) { return }       // provider has been destroyed

        for (let i = 0, l = UpdateKeys.length; i < l; i++) {
          await this._Store.removeItem(UpdateKeys[i])
          if (this._Store == null) { return }     // provider has been destroyed
        }

        UpdateKeys.splice(0,UpdateKeys.length, CompactKey)
      if (thisHadEnqueuedUpdates) { this._reportProgress() }
    }

  /**** _newUpdateKeyAmong - generates a new unique update key ****/

    private _newUpdateKeyAmong (UpdateKeys:string[]):string {
      let KeyBase:string = (
        (this._SuperProvider == null ? '' : this._sharedDoc.guid) + '@' + Date.now()
      ), KeySuffix:number = 0
        let UpdateKey:string = KeyBase + '-' + KeySuffix
        while (UpdateKeys.indexOf(UpdateKey) >= 0) {
          KeySuffix++
          UpdateKey = KeyBase + '-' + KeySuffix
        }
      return UpdateKey
    }

  /**** _removeStoredSubDoc - removes a single stored subdoc ****/

    private async _removeStoredSubDoc (SubDoc:Y.Doc):Promise<void> {
      let KeysToDelete = await this._StorageSubKeysFor(SubDoc)
      try {
        for (let i = 0, l = KeysToDelete.length; i < l; i++) {
          await this._Store.removeItem(KeysToDelete[i])
          if (this._Store == null) { return }     // provider has been destroyed
        }
      } catch (Signal) {
        this._breakdownWith(
          'could not remove persistence for subdoc ' + SubDoc.guid, Signal
        )
      }
    }

  /**** _breakdown - breaks down this provider ****/

    private _breakdown ():void {
// @ts-ignore allow clearing of "this._Store"
      this._Store = undefined

      this._isBusy = false

      if (! this.isSynced) {
        this._enqueuedUpdates = []
        this._pendingUpdates  = 0
        this.emit('sync-aborted',[this,1.0])
      }

      this._SubDocMap.forEach((Provider) => Provider._breakdown())
    }

  /**** _breakdownWith - breaks down this provider after failure ****/

    private _breakdownWith (Message:string, Reason?:any):never {
      this._breakdown()

      throw new Error(
        Message + (Reason == null ? '' : ', reason: ' + Reason)
      )
    }

  /**** _manageSubDocs - manages subdoc persistences ****/

    private async _manageSubDocs (Changes:SubDocChanges):Promise<void> {
      const providePersistenceFor = (SubDoc:Y.Doc) => {
        if (
          ! this._SubDocMap.has(SubDoc) &&
          (this._sharedDoc.guid !== SubDoc.guid)     // "doc copies" are strange
        ) {
          const SubDocProvider = new LocalForageProvider(
            this._Store, SubDoc, this._UpdateLimit, this
          )
          this._SubDocMap.set(SubDoc,SubDocProvider)
        }
      }

      const { added, removed, loaded } = Changes

      if (removed != null) {
        let SubDocList:Y.Doc[] = Array.from(removed.values())
        for (let i = 0, l = SubDocList.length; i < l; i++) {
          const SubDoc = SubDocList[i]

          const Provider = this._SubDocMap.get(SubDoc)
          if (Provider != null) { Provider._breakdown() }

          this._SubDocMap.delete(SubDoc)

          if (
            (this._sharedDoc != null) &&          // "doc copies" are strange...
            (this._sharedDoc.guid !== SubDoc.guid) &&
            Array.from(this._sharedDoc.getSubdocs().values()).every(
              (existingSubDoc) => (existingSubDoc.guid !== SubDoc.guid)
            )                                                       // ...really
          ) {
            await this._removeStoredSubDoc(SubDoc)
          }  // warning: pot. race condition if "guid" is immediately used again
        }
      }

      if (loaded != null) {
        loaded.forEach((SubDoc:Y.Doc) => {
          providePersistenceFor(SubDoc)
        })
      }
    }

  /**** _reportProgress - emits events reporting synchronization progress ****/

    private _reportProgress ():void {
      switch (true) {
        case (this._pendingUpdates === 0):
          this._completedUpdates = 0
          this.emit('synced',[this])
          this._sharedDoc.emit('sync',[this])     // resolves "whenSynced", once

          if (this._SuperProvider != null) {
            this._SuperProvider.emit('subdoc-synced',[this,this._sharedDoc])
          }
          break
        case (this._completedUpdates === 0) && (this._pendingUpdates === 1):
          this.emit('sync-started',[this,0.0])
          break
        case (this._completedUpdates === this._pendingUpdates):
          this.emit('sync-finished',[this,1.0])

          this._pendingUpdates = this._completedUpdates = 0
          this.emit('synced',[this])
          this._sharedDoc.emit('sync',[this])     // resolves "whenSynced", once

          if (this._SuperProvider != null) {
            this._SuperProvider.emit('subdoc-synced',[this,this._sharedDoc])
          }
          break
        default:
          const Progress = this._completedUpdates/this._pendingUpdates
          this.emit('sync-continued',[this,Progress])
      }
    }

  /**** _StorageKeys - lists all keys used for sharedDoc itself ****/

    private async _StorageKeys ():Promise<string[]> {
      let StoreKeys:string[] = await this._Store.keys()
      return StoreKeys.filter((Key) => Key.startsWith('@'))
    }

  /**** _StorageSubKeys - lists all keys used for subdocs of sharedDoc ****/

    private async _StorageSubKeys ():Promise<string[]> {
      let StoreKeys:string[] = await this._Store.keys()
      return StoreKeys.filter((Key) => ! Key.startsWith('@'))
    }

  /**** _StorageSubKeysFor - lists all keys used for a given subdoc ****/

    private async _StorageSubKeysFor (SubDoc:Y.Doc):Promise<string[]> {
      const KeyPrefix = SubDoc.guid + '@'

      let StoreKeys:string[] = await this._Store.keys()
      return StoreKeys.filter((Key) => Key.startsWith(KeyPrefix))
    }
  }
}
