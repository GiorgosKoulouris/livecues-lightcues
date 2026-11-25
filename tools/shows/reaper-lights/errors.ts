/** Base of every error a `lights:song` command reports: the message is for the user. */
export class LightsError extends Error {}

/** A Plan the generator cannot write. */
export class GenerateError extends LightsError {}
