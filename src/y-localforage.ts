import * as Y         from 'yjs'
import { Observable } from 'lib0/observable'

namespace LocalForageProvider {
  export class LocalForageProvider extends Observable<any> {
    private _Store:any
    private _sharedDoc:Y.Doc

    private _isLoading:boolean  = false
    private _UpdateLimit:number = 500

    private _pendingUpdates:number   = 0
    private _completedUpdates:number = 0

    private _enqueuedUpdates:Uint8Array[] = []

    constructor (Store:any, sharedDoc:Y.Doc, UpdateLimit:number = 500) {
      super()

      this._Store     = Store
      this._sharedDoc = sharedDoc

      this._isLoading   = false
      this._UpdateLimit = UpdateLimit

      this._storeUpdate = this._storeUpdate.bind(this)
      sharedDoc.on('update', this._storeUpdate)

      this.destroy = this.destroy.bind(this)
      sharedDoc.on('destroy', this.destroy)

      this._applyStoredUpdates()     // is safe, even while updated or destroyed
    }

  /**** _applyStoredUpdates - applies all stored (incremental) updates to sharedDoc ****/

    private async _applyStoredUpdates ():Promise<void> {
      this._isLoading = true     // prevents update entries from being compacted
        const UpdateKeys = await this._Store.keys()
        if (UpdateKeys.length > 0) {
          this._pendingUpdates += UpdateKeys.length; this._reportProgress()

          for (let i = 0, l = UpdateKeys.length; i < l; i++) {
            if (this._Store == null) { return }   // provider has been destroyed

            const Update = await this._Store.getItem(UpdateKeys[i])
            Y.applyUpdate(this._sharedDoc, Update)// can be applied in any order

            this._completedUpdates++; this._reportProgress()
          }
        } else {
          this._reportProgress()
        }
      this._isLoading = false           // allows update entries to be compacted
    }

  /**** _storeUpdate - stores a given (incremental) update ****/

    private _storeUpdate (Update:Uint8Array, Origin?:any):void {
      if (this._Store == null) { return }         // provider has been destroyed

      if (Origin !== this) {          // ignore updates applied by this provider
        this._pendingUpdates++; this._reportProgress()

        this._enqueuedUpdates.push(Update)
        if (this._enqueuedUpdates.length === 1) {
          this._storeUpdatesAndCompact()
        }            // never write (and compact!) multiple updates concurrently
      }
    }

  /**** _storeUpdatesAndCompact - stores enqueued updates and compacts ****/

    private async _storeUpdatesAndCompact ():Promise<void> {
      if (this._Store == null) { return }         // provider has been destroyed

      let UpdateKeys:string[] = await this._Store.keys()

      while ((this._Store != null) && (this._enqueuedUpdates.length > 0)) {
        await this._storeNextUpdateAmong(UpdateKeys)
        if (this._Store == null) { return }       // provider has been destroyed

        if ((UpdateKeys.length >= this._UpdateLimit) && ! this._isLoading) {
          await this._compactUpdates(UpdateKeys)
        }
      }
    }

  /**** _storeNextUpdateAmong - stores next enqueued updates ****/

    private async _storeNextUpdateAmong (UpdateKeys:string[]):Promise<void> {
      let UpdateKey:string = this._newUpdateKeyAmong(UpdateKeys)
      UpdateKeys.push(UpdateKey)

      await this._Store.setItem(UpdateKey,this._enqueuedUpdates[0])

      this._enqueuedUpdates.shift()
      this._pendingUpdates--; this._reportProgress()
    }

  /**** _compactUpdates - compacts the given list of updates ****/

    private async _compactUpdates (UpdateKeys:string[]):Promise<void> {
      this._enqueuedUpdates.unshift(Y.encodeStateAsUpdate(this._sharedDoc))
             // prevents incoming updates from being processed during compaction

      const thisHadEnqueuedUpdates = (this._enqueuedUpdates.length > 0)
        this._pendingUpdates -= this._enqueuedUpdates.length-1
        this._enqueuedUpdates.splice(1)     // all enqueued updates are included

        let UpdateKey:string = this._newUpdateKeyAmong(UpdateKeys)
        UpdateKeys.unshift(UpdateKey)

        await this._Store.setItem(UpdateKey,this._enqueuedUpdates[0])
        if (this._Store == null) { return }       // provider has been destroyed

        let KeysToDelete = UpdateKeys.splice(1)
        for (let i = 0, l = KeysToDelete.length; i < l; i++) {
          await this._Store.removeItem(KeysToDelete[i])
          if (this._Store == null) { return }     // provider has been destroyed
        }

        this._enqueuedUpdates.shift()   // may allow new updates to be processed
      if (thisHadEnqueuedUpdates) { this._reportProgress() }
    }

  /**** _newUpdateKeyAmong - generates a new unique update key ****/

    private _newUpdateKeyAmong (UpdateKeys:string[]):string {
      let KeyBase:number = Date.now(), KeySuffix:number = 0
        let UpdateKey:string = KeyBase + '-' + KeySuffix
        while (UpdateKeys.indexOf(UpdateKey) >= 0) {
          KeySuffix++
          UpdateKey = KeyBase + '-' + KeySuffix
        }
      return UpdateKey
    }

  /**** destroy - destroys persistence, invalidates provider ****/

    async destroy ():Promise<void> {
      if (this._Store == null) { return }         // provider has been destroyed

      let Store = this._Store
// @ts-ignore allow clearing of "this._Store"
      this._Store = undefined

      this._sharedDoc.off('update',  this._storeUpdate)
      this._sharedDoc.off('destroy', this.destroy)

      if (! this.isSynced) {
        this._pendingUpdates = 0
        this.emit('sync-aborted',[this,1.0])
      }

      let KeysToDelete:string[] = await Store.keys()
      for (let i = 0, l = KeysToDelete.length; i < l; i++) {
        await Store.removeItem(KeysToDelete[i])
      }
    }

  /**** isSynced - is true while this provider and its sharedDoc are in-sync ****/

    get isSynced ():boolean {
      return (this._pendingUpdates === 0)
    }

  /**** _reportProgress - emits events reporting synchronization progress ****/

    private _reportProgress ():void {
      switch (true) {
        case (this._pendingUpdates === 0):
          this._completedUpdates = 0
          this.emit('synced',[this])
          break
        case (this._completedUpdates === 0):
          this.emit('sync-started',[this,0.0])
          break
        case (this._completedUpdates === this._pendingUpdates):
          this.emit('sync-finished',[this,1.0])
          this._pendingUpdates = this._completedUpdates = 0
          this.emit('synced',[this])
          break
        default:
          const Progress = this._completedUpdates/this._pendingUpdates
          this.emit('sync-continued',[this,Progress])
      }
    }
  }
}
