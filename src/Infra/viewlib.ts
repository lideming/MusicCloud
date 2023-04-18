import { objectApply, Ref, View } from "./utils";

export * from "@yuuza/webfx";

export class FileSelector extends View {
  onfile: (file: File) => void;
  private domfile = new Ref<HTMLInputElement>();
  accept: string = "*/*";
  multiple = false;
  constructor(init: Partial<FileSelector>) {
    super();
    objectApply(this, init);
  }
  createDom() {
    return {
      tag: "input",
      type: "file",
      ref: this.domfile,
      style: "display: none; height: 0;",
      accept: this.accept,
      multiple: this.multiple,
    };
  }
  postCreateDom() {
    this.domfile.value!.addEventListener("change", (ev) => {
      if (this.domfile.value!.files)
        this.handleFiles(this.domfile.value!.files);
    });
  }
  open() {
    this.domfile.value!.click();
  }
  private handleFiles(files: FileList) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log("[Uploads] drop file", { name: file.name, size: file.size });
      this.onfile?.(file);
    }
  }
}
