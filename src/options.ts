/** Shared options. */
export interface Options {
    /** The buoy channel to listen to, minimum 10 chars, usually a uuid string. */
    channel: string
    /** The buoy service url, e.g. 'https://cb.anchor.link'. */
    service: string
}
