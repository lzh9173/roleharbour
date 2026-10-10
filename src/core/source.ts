/** An exact quotation of the job body: body.slice(start, end) === text. */
export interface SourceSegment {
  id: string;
  text: string;
  /** UTF-16 offsets into the exact body that was analysed. */
  start: number;
  end: number;
}
