/** One line of chat (ChatLine): text, the HUD tick it arrived on, and an id for replacing it. */
export class ChatLine {
  constructor(
    readonly updateCounterCreated: number,
    readonly lineString: string,
    readonly chatLineID: number,
  ) {}

  getChatLineString(): string {
    return this.lineString;
  }

  getUpdatedCounter(): number {
    return this.updateCounterCreated;
  }

  getChatLineID(): number {
    return this.chatLineID;
  }
}
