import * as Y from 'yjs';
import { Observable } from 'lib0/observable';

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

// Store Key Pattern: [<subdoc-guid>]@<timestamp>-<n>
var LocalForageProvider;
(function (LocalForageProvider_1) {
    class LocalForageProvider extends Observable {
        constructor(Store, sharedDoc, UpdateLimit = 500, SuperProvider) {
            super();
            this._isBusy = false;
            this._UpdateLimit = 500;
            this._pendingUpdates = 0;
            this._completedUpdates = 0;
            this._enqueuedUpdates = [];
            this._SubDocMap = new Map();
            this._Store = Store;
            this._sharedDoc = sharedDoc;
            this._SuperProvider = SuperProvider;
            this._isBusy = false;
            this._UpdateLimit = UpdateLimit;
            this._storeUpdate = this._storeUpdate.bind(this);
            sharedDoc.on('update', this._storeUpdate);
            this._manageSubDocs = this._manageSubDocs.bind(this);
            sharedDoc.on('subdocs', this._manageSubDocs);
            this.destroy = this.destroy.bind(this);
            sharedDoc.on('destroy', this.destroy);
            this._applyStoredUpdates(); // is safe, even while updated or destroyed
        }
        /**** isSynced - is true while this provider and its sharedDoc are in-sync ****/
        get isSynced() {
            return (this._pendingUpdates === 0);
        }
        /**** isFullySynced - is true while this._sharedDoc and all subdocs are in-sync ****/
        get isFullySynced() {
            return ((this._pendingUpdates === 0) &&
                Array.from(this._SubDocMap.values()).every((SubProvider) => SubProvider.isSynced));
        }
        /**** SubDocIsSynced - is true while the given SubDoc is in-sync ****/
        SubDocIsSynced(SubDoc) {
            const SubDocProvider = this._SubDocMap.get(SubDoc);
            return (SubDocProvider != null) && SubDocProvider.isSynced;
        }
        /**** destroy - destroys persistence, invalidates provider ****/
        destroy() {
            return __awaiter(this, void 0, void 0, function* () {
                if (this._Store == null) {
                    return;
                } // provider has been destroyed
                let Store = this._Store;
                // @ts-ignore allow clearing of "this._Store"
                this._Store = undefined;
                this._sharedDoc.off('update', this._storeUpdate);
                this._sharedDoc.off('subdocs', this._manageSubDocs);
                this._sharedDoc.off('destroy', this.destroy);
                if (!this.isSynced) {
                    this._pendingUpdates = 0;
                    this.emit('sync-aborted', [this, 1.0]);
                }
                const KeysToDelete = (this._SuperProvider == null
                    ? yield this._StorageKeys()
                    : yield this._StorageSubKeysFor(this._sharedDoc));
                for (let i = 0, l = KeysToDelete.length; i < l; i++) {
                    yield Store.removeItem(KeysToDelete[i]);
                }
            });
        }
        /**** _applyStoredUpdates - applies all stored (incremental) updates to sharedDoc ****/
        _applyStoredUpdates() {
            return __awaiter(this, void 0, void 0, function* () {
                this._isBusy = true; // prevents update entries from being persisted
                try {
                    this._pendingUpdates = 1; // very bad trick to keep this.isSynced false
                    const UpdateKeys = (this._SuperProvider == null
                        ? yield this._StorageKeys()
                        : yield this._StorageSubKeysFor(this._sharedDoc));
                    this._pendingUpdates--; // compensate trick from above
                    if (UpdateKeys.length > 0) {
                        this._pendingUpdates += UpdateKeys.length;
                        this._reportProgress();
                        for (let i = 0, l = UpdateKeys.length; i < l; i++) {
                            if (this._Store == null) {
                                return;
                            } // provider has been destroyed
                            const Update = yield this._Store.getItem(UpdateKeys[i]);
                            Y.applyUpdate(this._sharedDoc, Update, this);
                            // updates can be applied in any order
                            this._completedUpdates++;
                            this._reportProgress();
                        }
                        this._sharedDoc.emit('load', [this]); // resolves "whenLoaded"
                    }
                    else {
                        this._reportProgress();
                    }
                }
                catch (Signal) {
                    this._breakdownWith('could not restore document from persistence', Signal);
                }
                this._isBusy = false; // allows update entries to be persisted
                if (this._enqueuedUpdates.length > 0) {
                    this._storeUpdatesAndCompact();
                }
            });
        }
        /**** _storeUpdate - stores a given (incremental) update ****/
        _storeUpdate(Update, Origin) {
            if (this._Store == null) {
                return;
            } // provider has been destroyed
            if (Origin !== this) { // ignore updates applied by this provider
                this._pendingUpdates++;
                this._reportProgress();
                this._enqueuedUpdates.push(Update);
                if (!this._isBusy) {
                    this._storeUpdatesAndCompact();
                } // never write (and compact!) multiple updates concurrently
            }
        }
        /**** _storeUpdatesAndCompact - stores enqueued updates and compacts ****/
        _storeUpdatesAndCompact() {
            return __awaiter(this, void 0, void 0, function* () {
                if (this._Store == null) {
                    return;
                } // provider has been destroyed
                this._isBusy = true;
                const UpdateKeys = (this._SuperProvider == null
                    ? yield this._StorageKeys()
                    : yield this._StorageSubKeysFor(this._sharedDoc));
                while ((this._Store != null) && (this._enqueuedUpdates.length > 0)) {
                    try {
                        yield this._storeNextUpdateAmong(UpdateKeys);
                        if (this._Store == null) {
                            return;
                        } // provider has been destroyed
                    }
                    catch (Signal) {
                        this._breakdownWith('could not persist document update', Signal);
                    }
                    if (UpdateKeys.length >= this._UpdateLimit) {
                        try {
                            yield this._compactUpdates(UpdateKeys);
                        }
                        catch (Signal) {
                            this._breakdownWith('could not compact document updates', Signal);
                        }
                    }
                }
                this._isBusy = false;
            });
        }
        /**** _storeNextUpdateAmong - stores next enqueued updates ****/
        _storeNextUpdateAmong(UpdateKeys) {
            return __awaiter(this, void 0, void 0, function* () {
                let UpdateKey = this._newUpdateKeyAmong(UpdateKeys);
                UpdateKeys.push(UpdateKey);
                yield this._Store.setItem(UpdateKey, this._enqueuedUpdates[0]);
                this._enqueuedUpdates.shift();
                this._completedUpdates++;
                this._reportProgress();
            });
        }
        /**** _compactUpdates - compacts the given list of updates ****/
        _compactUpdates(UpdateKeys) {
            return __awaiter(this, void 0, void 0, function* () {
                const thisHadEnqueuedUpdates = (this._enqueuedUpdates.length > 0);
                this._pendingUpdates -= this._enqueuedUpdates.length;
                this._enqueuedUpdates = []; // all enqueued updates will be included
                let CompactKey = this._newUpdateKeyAmong(UpdateKeys);
                yield this._Store.setItem(CompactKey, Y.encodeStateAsUpdate(this._sharedDoc));
                if (this._Store == null) {
                    return;
                } // provider has been destroyed
                for (let i = 0, l = UpdateKeys.length; i < l; i++) {
                    yield this._Store.removeItem(UpdateKeys[i]);
                    if (this._Store == null) {
                        return;
                    } // provider has been destroyed
                }
                UpdateKeys.splice(0, UpdateKeys.length, CompactKey);
                if (thisHadEnqueuedUpdates) {
                    this._reportProgress();
                }
            });
        }
        /**** _newUpdateKeyAmong - generates a new unique update key ****/
        _newUpdateKeyAmong(UpdateKeys) {
            let KeyBase = ((this._SuperProvider == null ? '' : this._sharedDoc.guid) + '@' + Date.now()), KeySuffix = 0;
            let UpdateKey = KeyBase + '-' + KeySuffix;
            while (UpdateKeys.indexOf(UpdateKey) >= 0) {
                KeySuffix++;
                UpdateKey = KeyBase + '-' + KeySuffix;
            }
            return UpdateKey;
        }
        /**** _removeStoredSubDoc - removes a single stored subdoc ****/
        _removeStoredSubDoc(SubDoc) {
            return __awaiter(this, void 0, void 0, function* () {
                let KeysToDelete = yield this._StorageSubKeysFor(SubDoc);
                try {
                    for (let i = 0, l = KeysToDelete.length; i < l; i++) {
                        yield this._Store.removeItem(KeysToDelete[i]);
                        if (this._Store == null) {
                            return;
                        } // provider has been destroyed
                    }
                }
                catch (Signal) {
                    this._breakdownWith('could not remove persistence for subdoc ' + SubDoc.guid, Signal);
                }
            });
        }
        /**** _breakdown - breaks down this provider ****/
        _breakdown() {
            // @ts-ignore allow clearing of "this._Store"
            this._Store = undefined;
            this._isBusy = false;
            if (!this.isSynced) {
                this._enqueuedUpdates = [];
                this._pendingUpdates = 0;
                this.emit('sync-aborted', [this, 1.0]);
            }
            this._SubDocMap.forEach((Provider) => Provider._breakdown());
        }
        /**** _breakdownWith - breaks down this provider after failure ****/
        _breakdownWith(Message, Reason) {
            this._breakdown();
            throw new Error(Message + (Reason == null ? '' : ', reason: ' + Reason));
        }
        /**** _manageSubDocs - manages subdoc persistences ****/
        _manageSubDocs(Changes) {
            return __awaiter(this, void 0, void 0, function* () {
                const providePersistenceFor = (SubDoc) => {
                    if (!this._SubDocMap.has(SubDoc) &&
                        (this._sharedDoc.guid !== SubDoc.guid) // "doc copies" are strange
                    ) {
                        const SubDocProvider = new LocalForageProvider(this._Store, SubDoc, this._UpdateLimit, this);
                        this._SubDocMap.set(SubDoc, SubDocProvider);
                    }
                };
                const { added, removed, loaded } = Changes;
                if (removed != null) {
                    let SubDocList = Array.from(removed.values());
                    for (let i = 0, l = SubDocList.length; i < l; i++) {
                        const SubDoc = SubDocList[i];
                        const Provider = this._SubDocMap.get(SubDoc);
                        if (Provider != null) {
                            Provider._breakdown();
                        }
                        this._SubDocMap.delete(SubDoc);
                        if ((this._sharedDoc != null) && // "doc copies" are strange...
                            (this._sharedDoc.guid !== SubDoc.guid) &&
                            Array.from(this._sharedDoc.getSubdocs().values()).every((existingSubDoc) => (existingSubDoc.guid !== SubDoc.guid)) // ...really
                        ) {
                            yield this._removeStoredSubDoc(SubDoc);
                        } // warning: pot. race condition if "guid" is immediately used again
                    }
                }
                if (loaded != null) {
                    loaded.forEach((SubDoc) => {
                        providePersistenceFor(SubDoc);
                    });
                }
            });
        }
        /**** _reportProgress - emits events reporting synchronization progress ****/
        _reportProgress() {
            switch (true) {
                case (this._pendingUpdates === 0):
                    this._completedUpdates = 0;
                    this.emit('synced', [this]);
                    this._sharedDoc.emit('sync', [this]); // resolves "whenSynced", once
                    if (this._SuperProvider != null) {
                        this._SuperProvider.emit('subdoc-synced', [this, this._sharedDoc]);
                    }
                    break;
                case (this._completedUpdates === 0) && (this._pendingUpdates === 1):
                    this.emit('sync-started', [this, 0.0]);
                    break;
                case (this._completedUpdates === this._pendingUpdates):
                    this.emit('sync-finished', [this, 1.0]);
                    this._pendingUpdates = this._completedUpdates = 0;
                    this.emit('synced', [this]);
                    this._sharedDoc.emit('sync', [this]); // resolves "whenSynced", once
                    if (this._SuperProvider != null) {
                        this._SuperProvider.emit('subdoc-synced', [this, this._sharedDoc]);
                    }
                    break;
                default:
                    const Progress = this._completedUpdates / this._pendingUpdates;
                    this.emit('sync-continued', [this, Progress]);
            }
        }
        /**** _StorageKeys - lists all keys used for sharedDoc itself ****/
        _StorageKeys() {
            return __awaiter(this, void 0, void 0, function* () {
                let StoreKeys = yield this._Store.keys();
                return StoreKeys.filter((Key) => Key.startsWith('@'));
            });
        }
        /**** _StorageSubKeys - lists all keys used for subdocs of sharedDoc ****/
        _StorageSubKeys() {
            return __awaiter(this, void 0, void 0, function* () {
                let StoreKeys = yield this._Store.keys();
                return StoreKeys.filter((Key) => !Key.startsWith('@'));
            });
        }
        /**** _StorageSubKeysFor - lists all keys used for a given subdoc ****/
        _StorageSubKeysFor(SubDoc) {
            return __awaiter(this, void 0, void 0, function* () {
                const KeyPrefix = SubDoc.guid + '@';
                let StoreKeys = yield this._Store.keys();
                return StoreKeys.filter((Key) => Key.startsWith(KeyPrefix));
            });
        }
    }
    LocalForageProvider_1.LocalForageProvider = LocalForageProvider;
})(LocalForageProvider || (LocalForageProvider = {}));
//# sourceMappingURL=y-localforage.esm.js.map
