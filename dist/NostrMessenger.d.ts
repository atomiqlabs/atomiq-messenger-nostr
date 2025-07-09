import { Message, Messenger } from "@atomiqlabs/base";
import { MessageDeduplicator } from "./MessageDeduplicator";
import { AbstractSimplePool } from "nostr-tools/abstract-pool";
export declare class NostrMessenger implements Messenger {
    secretKey: Uint8Array;
    relays: string[];
    pool: AbstractSimplePool;
    reconnectTimeout: number;
    callbacks: ((msg: Message) => void)[];
    messageDeduplicator: MessageDeduplicator;
    constructor(relays: string[], options?: {
        reconnectTimeout?: number;
        wsImplementation?: typeof WebSocket;
    });
    broadcast(msg: Message): Promise<void>;
    private stopped;
    init(): Promise<void>;
    stop(): Promise<void>;
    private connectRelay;
    private subscribed;
    private initSubscribe;
    subscribe(callback: (msg: Message) => void): Promise<void>;
    unsubscribe(callback: (msg: Message) => void): Promise<boolean>;
}
