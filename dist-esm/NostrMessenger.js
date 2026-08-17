import { BitcoinNetwork, Message } from "@atomiqlabs/base";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { verifyEvent } from "nostr-tools/pure";
import { MessageDeduplicator } from "./MessageDeduplicator.js";
import { AbstractSimplePool } from "nostr-tools/abstract-pool";
const KINDS = {
    [BitcoinNetwork.MAINNET]: 28643,
    [BitcoinNetwork.TESTNET]: 28644,
    [BitcoinNetwork.TESTNET4]: 28645,
    [BitcoinNetwork.REGTEST]: 28646,
};
export class NostrMessenger {
    constructor(network, relays, options) {
        this.callbacks = [];
        this.messageDeduplicator = new MessageDeduplicator();
        this.stopped = true;
        this.subscribed = false;
        options ??= {};
        this.network = network;
        this.secretKey = generateSecretKey();
        this.relays = relays;
        this.wsImplementation = options.wsImplementation;
        this.reconnectTimeout = options?.reconnectTimeout ?? 15 * 1000;
    }
    warmup() {
        return Promise.any(this.relays.map(relay => this.pool.ensureRelay(relay))).then(val => { });
    }
    async broadcast(msg) {
        const signedEvent = finalizeEvent({
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
        this.pool = new AbstractSimplePool({
            websocketImplementation: wsImplementation,
            verifyEvent,
            enablePing: true
        });
        this.stopped = false;
    }
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
                    const message = Message.deserialize(rawObj);
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
