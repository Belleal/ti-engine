declare const _exports: {
    parseRecord: typeof parseRecord;
    parseVocabulary: typeof parseVocabulary;
    readSources: typeof readSources;
    readVocabulary: typeof readVocabulary;
};
export = _exports;
/**
 * Parses source text into a raw content record. Pure -- no validation happens here; the record is validated by the
 * loader when it is indexed.
 *
 * @param {string} text
 * @param {{ format: string }} options  format is "markdown" (YAML front-matter + body) or "yaml".
 * @returns {Object}
 * @throws on malformed YAML.
 */
declare function parseRecord(text: string, options: {
    format: string;
}): Object;
/**
 * Parses a taxonomy vocabulary file (taxonomies.yml).
 *
 * @param {string} text
 * @returns {Object}
 */
declare function parseVocabulary(text: string): Object;
/**
 * Reads an explicitly registered list of content source files.
 *
 * @param {string[]} sources  Explicit file paths. A directory is an error, never expanded.
 * @returns {{ records: Object[], errors: Array<{ source: string, error: string }> }}
 */
declare function readSources(sources: string[]): {
    records: Object[];
    errors: Array<{
        source: string;
        error: string;
    }>;
};
/**
 * Reads a taxonomy vocabulary file from disk.
 *
 * @param {string} filePath
 * @returns {Object}
 */
declare function readVocabulary(filePath: string): Object;
