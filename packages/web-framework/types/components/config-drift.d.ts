export declare var diffDocument: (fileDefault: any, storedValue: any) => {
    status: string;
    entries: ConfigDriftEntry[];
    counts: {
        added: number;
        removed: number;
        changed: number;
    };
};
export type ConfigDriftEntry = {
    /**
     * Dot/bracket data path, matching the dialect used for schema validation issues.
     */
    path: string;
    /**
     * One of "added", "removed", "changed".
     */
    kind: string;
    /**
     * For a primitive array: how many members the file default adds.
     */
    addedMembers?: number;
    /**
     * For a primitive array: how many members the file default drops.
     */
    removedMembers?: number;
};
