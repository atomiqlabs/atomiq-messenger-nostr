import { Message, Messenger } from "@atomiqlabs/base";
import { SimplePool } from "nostr-tools";
import { MessageDeduplicator } from "./MessageDeduplicator";
export declare class NostrMessenger implements Messenger {
    secretKey: Uint8Array;
    relays: string[];
    pool: SimplePool;
    reconnectTimeout: number;
    callbacks: ((msg: Message) => void)[];
    messageDeduplicator: MessageDeduplicator;
    constructor(relays: string[], options?: {
        reconnectTimeout?: number;
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
