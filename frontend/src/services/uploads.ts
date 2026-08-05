import { api } from "./api";
import type { Attachment } from "../types";

export async function uploadFiles(files: File[]): Promise<Attachment[]> {
  if (!files.length) return [];
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const { data } = await api.post<Attachment[]>("/uploads/batch", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
