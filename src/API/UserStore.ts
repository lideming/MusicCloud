import { api } from "./Api";

const TypedArray = Object.getPrototypeOf(Uint8Array);

class UserStore {
  async get(
    key: string,
    type: "json" | "raw" = "json", // try parse as JSON and return as object
  ): Promise<null | ({ value: any } & UserStoreFields)> {
    var resp = await api._fetch(`${api.baseUrl}my/store/${key}`, {
      headers: api.getHeaders(),
    });
    if (!resp.ok) return null;
    let value;
    if (type === "json") {
      value = await resp.json();
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
    if (!(value instanceof ArrayBuffer || value instanceof TypedArray || value instanceof Blob)) {
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
  revision: number;
  visibility: number;
}
