export declare function parseUpdate(body: unknown): {
    message: {
        from: {
            id: number;
            first_name: unknown;
            last_name: unknown;
        };
        chat: {
            id: number;
        };
        text: string;
    };
} | null;
