declare module 'encoding-japanese' {
  interface ConvertOptions {
    to: string;
    from: string;
    type?: string;
  }

  const Encoding: {
    stringToCode(str: string): number[];
    convert(data: number[], options: ConvertOptions): number[] | Uint8Array;
  };

  export default Encoding;
}
