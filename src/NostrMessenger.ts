import {Message, Messenger} from "@atomiqlabs/base";
import {finalizeEvent, generateSecretKey} from "nostr-tools/pure";
import {verifyEvent} from "nostr-tools/pure";
import {AbstractRelay} from "nostr-tools/abstract-relay";
import {MessageDeduplicator} from "./MessageDeduplicator";
import {AbstractSimplePool} from "nostr-tools/abstract-pool";

const KIND = 28643; //In range 20000-29999 of ephemeral events

export class NostrMessenger implements Messenger {

    secretKey: Uint8Array;
    relays: string[];
    pool: AbstractSimplePool;
    reconnectTimeout: number;

    callbacks: ((msg: Message) => void)[] = [];
    messageDeduplicator: MessageDeduplicator = new MessageDeduplicator();

    constructor(relays: string[], options?: {
        reconnectTimeout?: number,
        wsImplementation?: typeof WebSocket
    }) {
        this.secretKey = generateSecretKey();
        this.relays = relays;
        this.pool = new AbstractSimplePool({
            websocketImplementation: options?.wsImplementation,
            verifyEvent
        });
        this.reconnectTimeout = options?.reconnectTimeout ?? 15*1000;
    }

    async broadcast(msg: Message): Promise<void> {
        const signedEvent = finalizeEvent({
            kind: KIND,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(msg.serialize())
        }, this.secretKey);
        await Promise.any(this.pool.publish(this.relays, signedEvent));
    }

    private stopped = true;

    init(): Promise<void> {
        this.stopped = false;
        return Promise.resolve(undefined);
    }

    stop(): Promise<void> {
        this.stopped = true;
        this.pool.destroy();
        return Promise.resolve(undefined);
    }

    private async connectRelay(relayUrl: string) {
        if(this.stopped) return;
        let relay: AbstractRelay;
        try {
            relay = await this.pool.ensureRelay(relayUrl);
        } catch (e) {
            console.error("NostrMessenger: connectRelay("+relayUrl+"): Error on relay connection: ", e);
            setTimeout(() => this.connectRelay(relayUrl), this.reconnectTimeout);
            return;
        }
        relay.subscribe([{kinds: [KIND]}], {
            onevent: (event) => {
                if(this.messageDeduplicator.isDuplicate(event.id)) return;
                try {
                    const rawObj = JSON.parse(event.content);
                    const message = Message.deserialize(rawObj);
                    for(let callback of this.callbacks) {
                        callback(message);
                    }
                } catch (e) {}
            },
            onclose: (reason: string) => {
                console.error("NostrMessenger: connectRelay("+relayUrl+"): Error on relay subscription: "+reason);
                setTimeout(() => this.connectRelay(relayUrl), this.reconnectTimeout);
            }
        });
    }

    private subscribed: boolean = false;

    private async initSubscribe() {
        if(this.subscribed) return;
        this.subscribed = true;
        await Promise.all(this.relays.map(relay => this.connectRelay(relay)));
    }

    async subscribe(callback: (msg: Message) => void): Promise<void> {
        if(this.stopped) throw new Error("Already stopped or not initialized!");
        await this.initSubscribe();
        this.callbacks.push(callback);
    }

    unsubscribe(callback: (msg: Message) => void): Promise<boolean> {
        const position = this.callbacks.indexOf(callback);
        if(position===-1) return Promise.resolve(false);
        this.callbacks.splice(position, 1);
        return Promise.resolve(true);
    }

}