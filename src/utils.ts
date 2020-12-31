export * from "@yuuza/webfx";

export function assert(val: any): asserts val  {
    if (!val) throw new Error("val is falthy");
}
