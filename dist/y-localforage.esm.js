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

var LocalForageProvider;
(function (LocalForageProvider_1) {
    class LocalForageProvider extends Observable {
        constructor(Store, sharedDoc, UpdateLimit = 500) {
            super();
            this._isLoading = false;
            this._UpdateLimit = 500;
            this._pendingUpdates = 0;
            this._completedUpdates = 0;
            this._enqueuedUpdates = [];
            this._Store = Store;
            this._sharedDoc = sharedDoc;
            this._isLoading = false;
            this._UpdateLimit = UpdateLimit;
            this._storeUpdate = this._storeUpdate.bind(this);
            sharedDoc.on('update', this._storeUpdate);
            this.destroy = this.destroy.bind(this);
            sharedDoc.on('destroy', this.destroy);
            this._applyStoredUpdates(); // is safe, even while updated or destroyed
        }
        /**** _applyStoredUpdates - applies all stored (incremental) updates to sharedDoc ****/
        _applyStoredUpdates() {
            return __awaiter(this, void 0, void 0, function* () {
                this._isLoading = true; // prevents update entries from being compacted
                const UpdateKeys = yield this._Store.keys();
                if (UpdateKeys.length > 0) {
                    this._pendingUpdates += UpdateKeys.length;
                    this._reportProgress();
                    for (let i = 0, l = UpdateKeys.length; i < l; i++) {
                        if (this._Store == null) {
                            return;
                        } // provider has been destroyed
                        const Update = yield this._Store.getItem(UpdateKeys[i]);
                        Y.applyUpdate(this._sharedDoc, Update); // can be applied in any order
                        this._completedUpdates++;
                        this._reportProgress();
                    }
                }
                else {
                    this._reportProgress();
                }
                this._isLoading = false; // allows update entries to be compacted
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
                if (this._enqueuedUpdates.length === 1) {
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
                let UpdateKeys = yield this._Store.keys();
                while ((this._Store != null) && (this._enqueuedUpdates.length > 0)) {
                    yield this._storeNextUpdateAmong(UpdateKeys);
                    if (this._Store == null) {
                        return;
                    } // provider has been destroyed
                    if ((UpdateKeys.length >= this._UpdateLimit) && !this._isLoading) {
                        yield this._compactUpdates(UpdateKeys);
                    }
                }
            });
        }
        /**** _storeNextUpdateAmong - stores next enqueued updates ****/
        _storeNextUpdateAmong(UpdateKeys) {
            return __awaiter(this, void 0, void 0, function* () {
                let UpdateKey = this._newUpdateKeyAmong(UpdateKeys);
                UpdateKeys.push(UpdateKey);
                yield this._Store.setItem(UpdateKey, this._enqueuedUpdates[0]);
                this._enqueuedUpdates.shift();
                this._pendingUpdates--;
                this._reportProgress();
            });
        }
        /**** _compactUpdates - compacts the given list of updates ****/
        _compactUpdates(UpdateKeys) {
            return __awaiter(this, void 0, void 0, function* () {
                this._enqueuedUpdates.unshift(Y.encodeStateAsUpdate(this._sharedDoc));
                // prevents incoming updates from being processed during compaction
                const thisHadEnqueuedUpdates = (this._enqueuedUpdates.length > 0);
                this._pendingUpdates -= this._enqueuedUpdates.length - 1;
                this._enqueuedUpdates.splice(1); // all enqueued updates are included
                let UpdateKey = this._newUpdateKeyAmong(UpdateKeys);
                UpdateKeys.unshift(UpdateKey);
                yield this._Store.setItem(UpdateKey, this._enqueuedUpdates[0]);
                if (this._Store == null) {
                    return;
                } // provider has been destroyed
                let KeysToDelete = UpdateKeys.splice(1);
                for (let i = 0, l = KeysToDelete.length; i < l; i++) {
                    yield this._Store.removeItem(KeysToDelete[i]);
                    if (this._Store == null) {
                        return;
                    } // provider has been destroyed
                }
                this._enqueuedUpdates.shift(); // may allow new updates to be processed
                if (thisHadEnqueuedUpdates) {
                    this._reportProgress();
                }
            });
        }
        /**** _newUpdateKeyAmong - generates a new unique update key ****/
        _newUpdateKeyAmong(UpdateKeys) {
            let KeyBase = Date.now(), KeySuffix = 0;
            let UpdateKey = KeyBase + '-' + KeySuffix;
            while (UpdateKeys.indexOf(UpdateKey) >= 0) {
                KeySuffix++;
                UpdateKey = KeyBase + '-' + KeySuffix;
            }
            return UpdateKey;
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
                this._sharedDoc.off('destroy', this.destroy);
                if (!this.isSynced) {
                    this._pendingUpdates = 0;
                    this.emit('sync-aborted', [this, 1.0]);
                }
                let KeysToDelete = yield Store.keys();
                for (let i = 0, l = KeysToDelete.length; i < l; i++) {
                    yield Store.removeItem(KeysToDelete[i]);
                }
            });
        }
        /**** isSynced - is true while this provider and its sharedDoc are in-sync ****/
        get isSynced() {
            return (this._pendingUpdates === 0);
        }
        /**** _reportProgress - emits events reporting synchronization progress ****/
        _reportProgress() {
            switch (true) {
                case (this._pendingUpdates === 0):
                    this._completedUpdates = 0;
                    this.emit('synced', [this]);
                    break;
                case (this._completedUpdates === 0):
                    this.emit('sync-started', [this, 0.0]);
                    break;
                case (this._completedUpdates === this._pendingUpdates):
                    this.emit('sync-finished', [this, 1.0]);
                    this._pendingUpdates = this._completedUpdates = 0;
                    this.emit('synced', [this]);
                    break;
                default:
                    const Progress = this._completedUpdates / this._pendingUpdates;
                    this.emit('sync-continued', [this, Progress]);
            }
        }
    }
    LocalForageProvider_1.LocalForageProvider = LocalForageProvider;
})(LocalForageProvider || (LocalForageProvider = {}));
//# sourceMappingURL=y-localforage.esm.js.map
