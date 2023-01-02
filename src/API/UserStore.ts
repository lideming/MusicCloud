import { ObjectInit, objectInit } from "@yuuza/webfx";
import { api } from "./Api";

const TypedArray = Object.getPrototypeOf(Uint8Array);

export type UserStoreValueType = "json" | "text" | "raw";

class UserStore {
  async get<T = any>(
    key: string,
    type?: "json",
  ): Promise<null | ({ value: T } & UserStoreFields)>;
  async get(
    key: string,
    type: "text",
  ): Promise<null | ({ value: string } & UserStoreFields)>;
  async get(
    key: string,
    type: "raw",
  ): Promise<null | ({ value: ArrayBuffer } & UserStoreFields)>;
  async get(
    key: string,
    type: UserStoreValueType,
  ): Promise<null | ({ value: any } & UserStoreFields)>;

  async get(
    key: string,
    type: UserStoreValueType = "json",
  ): Promise<null | ({ value: any } & UserStoreFields)> {
    var resp = await api._fetch(`${api.baseUrl}my/store/${key}`, {
      headers: api.getHeaders(),
    });
    if (!resp.ok) return null;
    let value;
    if (type === "json") {
      value = await resp.json();
    } else if (type === "text") {
      value = await resp.text();
    } else if (type === "raw") {
      value = await resp.arrayBuffer();
    } else {
      throw new Error("unknown type");
    }
    const fields = new URLSearchParams(
      resp.headers.get("x-mcloud-store-fields")!,
    );
    const visibility = +fields.get("visibility")!;
    const revision = +fields.get("revision")!;
    return { value, visibility, revision };
  }

  async set(
    key: string,
    data: { value: any } & Partial<UserStoreFields>,
  ): Promise<void> {
    let { value } = data;
    if (
      !(value instanceof ArrayBuffer || value instanceof TypedArray ||
        value instanceof Blob)
    ) {
      value = JSON.stringify(value);
    }
    const headers = api.getHeaders();
    if (data.revision != null || data.visibility != null) {
      const fields = new URLSearchParams();
      if (data.visibility != null) {
        fields.set("visibility", "" + data.visibility);
      }
      if (data.revision != null) fields.set("revision", "" + data.revision);
      headers["x-mcloud-store-fields"] = fields.toString();
    }
    var resp = await api._fetch(`${api.baseUrl}my/store/${key}`, {
      method: "PUT",
      headers,
      body: value,
    });
    api.checkResp({}, resp);
  }

  async delete(
    key: string,
    data: { value: any } & Partial<UserStoreFields>,
  ): Promise<void> {
    let { value } = data;
    if (!(value instanceof ArrayBuffer || value instanceof Blob)) {
      value = JSON.stringify(value);
    }
    var resp = await api._fetch(`${api.baseUrl}my/store/${key}`, {
      method: "DELETE",
      headers: api.getHeaders(),
    });
    api.checkResp({}, resp);
  }
}

export const userStore = new UserStore();

export interface UserStoreFields {
  revision?: number;
  visibility?: number;
}

export class UserStoreItem<T = any> implements UserStoreFields {
  key: string;
  value: T;
  type: UserStoreValueType = "json";
  revision: number;
  visibility: number;

  constructor(init?: ObjectInit<UserStoreItem<T>>) {
    objectInit(this, init);
  }

  async fetch() {
    const result = await userStore.get(this.key, this.type);
    if (result) Object.assign(this, result);
  }

  async put() {
    await userStore.set(this.key, this);
    this.revision++;
  }
}
