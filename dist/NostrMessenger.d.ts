import { BitcoinNetwork, Message, Messenger } from "@atomiqlabs/base";
import { MessageDeduplicator } from "./MessageDeduplicator.js";
import { AbstractSimplePool } from "nostr-tools/abstract-pool";
/**
 * Nostr-based messenger for data propagation. Broadcasts messages as Nostr notes and allows watchtowers to subscribe
 *  to these notes as messages.
 *
 * @category Messenger
 */
export declare class NostrMessenger implements Messenger {
    network: BitcoinNetwork;
    secretKey: Uint8Array;
    relays: string[];
    pool: AbstractSimplePool;
    reconnectTimeout: number;
    private wsImplementation?;
    callbacks: ((msg: Message) => void)[];
    messageDeduplicator: MessageDeduplicator;
    constructor(network: BitcoinNetwork, relays: string[], options?: {
        reconnectTimeout?: number;
        wsImplementation?: typeof WebSocket;
    });
    /**
     * @inheritDoc
     */
    warmup(): Promise<void>;
    /**
     * @inheritDoc
     */
    broadcast(msg: Message): Promise<void>;
    private stopped;
    /**
     * @inheritDoc
     */
    init(): Promise<void>;
    /**
     * @inheritDoc
     */
    stop(): Promise<void>;
    private connectRelay;
    private subscribed;
    private initSubscribe;
    /**
     * @inheritDoc
     */
    subscribe(callback: (msg: Message) => void): Promise<void>;
    /**
     * @inheritDoc
     */
    unsubscribe(callback: (msg: Message) => void): Promise<boolean>;
}
