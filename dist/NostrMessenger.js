"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NostrMessenger = void 0;
const base_1 = require("@atomiqlabs/base");
const pure_1 = require("nostr-tools/pure");
const pure_2 = require("nostr-tools/pure");
const MessageDeduplicator_js_1 = require("./MessageDeduplicator.js");
const abstract_pool_1 = require("nostr-tools/abstract-pool");
const KINDS = {
    [base_1.BitcoinNetwork.MAINNET]: 28643,
    [base_1.BitcoinNetwork.TESTNET]: 28644,
    [base_1.BitcoinNetwork.TESTNET4]: 28645,
    [base_1.BitcoinNetwork.REGTEST]: 28646,
};
/**
 * Nostr-based messenger for data propagation. Broadcasts messages as Nostr notes and allows watchtowers to subscribe
 *  to these notes as messages.
 *
 * @category Messenger
 */
class NostrMessenger {
    constructor(network, relays, options) {
        this.callbacks = [];
        this.messageDeduplicator = new MessageDeduplicator_js_1.MessageDeduplicator();
        this.stopped = true;
        this.subscribed = false;
        options ??= {};
        this.network = network;
        this.secretKey = (0, pure_1.generateSecretKey)();
        this.relays = relays;
        this.wsImplementation = options.wsImplementation;
        this.reconnectTimeout = options?.reconnectTimeout ?? 15 * 1000;
    }
    /**
     * @inheritDoc
     */
    warmup() {
        return Promise.any(this.relays.map(relay => this.pool.ensureRelay(relay))).then(val => { });
    }
    /**
     * @inheritDoc
     */
    async broadcast(msg) {
        const signedEvent = (0, pure_1.finalizeEvent)({
            kind: KINDS[this.network],
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(msg.serialize())
        }, this.secretKey);
        await Promise.any(this.pool.publish(this.relays, signedEvent));
    }
    /**
     * @inheritDoc
     */
    async init() {
        const wsImplementation = this.wsImplementation ?? (typeof window !== "undefined" && typeof window.WebSocket !== "undefined"
            ? window.WebSocket
            : (await import("ws")).default);
        this.pool = new abstract_pool_1.AbstractSimplePool({
            websocketImplementation: wsImplementation,
            verifyEvent: pure_2.verifyEvent,
            enablePing: true
        });
        this.stopped = false;
    }
    /**
     * @inheritDoc
     */
    stop() {
        this.stopped = true;
        this.pool?.destroy();
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
            this.pool.close([relayUrl]);
            setTimeout(() => this.connectRelay(relayUrl), this.reconnectTimeout);
            return;
        }
        relay.onclose = () => {
            console.error("NostrMessenger: connectRelay(" + relayUrl + "): Connection closed!");
        };
        relay.subscribe([{ kinds: [KINDS[this.network]] }], {
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
                this.pool.close([relayUrl]);
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
    /**
     * @inheritDoc
     */
    async subscribe(callback) {
        if (this.stopped)
            throw new Error("Already stopped or not initialized!");
        await this.initSubscribe();
        this.callbacks.push(callback);
    }
    /**
     * @inheritDoc
     */
    unsubscribe(callback) {
        const position = this.callbacks.indexOf(callback);
        if (position === -1)
            return Promise.resolve(false);
        this.callbacks.splice(position, 1);
        return Promise.resolve(true);
    }
}
exports.NostrMessenger = NostrMessenger;
