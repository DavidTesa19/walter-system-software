import { apiUpload } from "./api";

export const uploadDocuments = async (endpoint: string, files: File[]): Promise<void> => {
  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    await apiUpload(endpoint, formData);
  }
};