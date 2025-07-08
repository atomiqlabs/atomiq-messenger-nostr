"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NostrMessenger = void 0;
const base_1 = require("@atomiqlabs/base");
const pure_1 = require("nostr-tools/pure");
const nostr_tools_1 = require("nostr-tools");
const MessageDeduplicator_1 = require("./MessageDeduplicator");
const KIND = 28643; //In range 20000-29999 of ephemeral events
class NostrMessenger {
    constructor(relays, options) {
        this.callbacks = [];
        this.messageDeduplicator = new MessageDeduplicator_1.MessageDeduplicator();
        this.stopped = true;
        this.subscribed = false;
        this.secretKey = (0, pure_1.generateSecretKey)();
        this.relays = relays;
        this.pool = new nostr_tools_1.SimplePool();
        this.reconnectTimeout = options?.reconnectTimeout ?? 15 * 1000;
    }
    async broadcast(msg) {
        const signedEvent = (0, pure_1.finalizeEvent)({
            kind: KIND,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(msg.serialize())
        }, this.secretKey);
        await Promise.any(this.pool.publish(this.relays, signedEvent));
    }
    init() {
        this.stopped = false;
        return Promise.resolve(undefined);
    }
    stop() {
        this.stopped = true;
        this.pool.destroy();
        return Promise.resolve(undefined);
    }
    async connectRelay(relayUrl) {
        if (this.stopped)
            return;
        let relay;
        try {
            relay = await this.pool.ensureRelay(relayUrl);
        }
        catch (e) {
            console.error("NostrMessenger: connectRelay(" + relayUrl + "): Error on relay connection: ", e);
            setTimeout(() => this.connectRelay(relayUrl), this.reconnectTimeout);
            return;
        }
        relay.subscribe([{ kinds: [KIND] }], {
            onevent: (event) => {
                if (this.messageDeduplicator.isDuplicate(event.id))
                    return;
                try {
                    const rawObj = JSON.parse(event.content);
                    const message = base_1.Message.deserialize(rawObj);
                    for (let callback of this.callbacks) {
                        callback(message);
                    }
                }
                catch (e) { }
            },
            onclose: (reason) => {
                console.error("NostrMessenger: connectRelay(" + relayUrl + "): Error on relay subscription: " + reason);
                setTimeout(() => this.connectRelay(relayUrl), this.reconnectTimeout);
            }
        });
    }
    async initSubscribe() {
        if (this.subscribed)
            return;
        this.subscribed = true;
        await Promise.all(this.relays.map(relay => this.connectRelay(relay)));
    }
    async subscribe(callback) {
        if (this.stopped)
            throw new Error("Already stopped or not initialized!");
        await this.initSubscribe();
        this.callbacks.push(callback);
    }
    unsubscribe(callback) {
        const position = this.callbacks.indexOf(callback);
        if (position === -1)
            return Promise.resolve(false);
        this.callbacks.splice(position, 1);
        return Promise.resolve(true);
    }
}
exports.NostrMessenger = NostrMessenger;
