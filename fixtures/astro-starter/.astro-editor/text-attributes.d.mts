export interface TextAttribute {
  name: string;
  start: number;
  end: number;
  value?: string;
  valueStart?: number;
  valueEnd?: number;
}

export function readTextAttributes(text: string): TextAttribute[] | undefined;
