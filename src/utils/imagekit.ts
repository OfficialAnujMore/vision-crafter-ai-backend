import axios from "axios";
import { env } from "../config/env.js";

function getImageKitAuthHeader(): string {
  const credentials = `${env.IMAGEKIT_PRIVATE_KEY}:`;
  const encoded = Buffer.from(credentials, "utf-8").toString("base64");
  return `Basic ${encoded}`;
}

function sanitizeFileBasename(name: string): string {
  let normalized = name.trim().toLowerCase();
  normalized = normalized.replace(/\s+/g, "-");
  normalized = normalized.replace(/[^a-z0-9._-]/g, "-");
  normalized = normalized.replace(/-+/g, "-").replace(/^[-._]+|[-._]+$/g, "");
  return normalized || "untitled";
}

export async function getFileDetailsFromImageKit(
  fileId: string
): Promise<Record<string, unknown>> {
  if (!fileId) throw new Error("file_id is required");

  const url = `https://api.imagekit.io/v1/files/${fileId}/details`;
  const response = await axios.get(url, {
    headers: {
      Accept: "application/json",
      Authorization: getImageKitAuthHeader(),
    },
  });

  if (response.status !== 200) {
    throw new Error(
      `Failed to fetch file details from ImageKit (${response.status}): ${response.data}`
    );
  }

  return response.data;
}

export async function renameImageInImageKit(
  fileId: string,
  newTitle: string
): Promise<Record<string, unknown>> {
  const fileDetails = await getFileDetailsFromImageKit(fileId);

  const currentName = (fileDetails.name as string) ?? "";
  const filePath = fileDetails.filePath as string;

  if (!filePath) {
    throw new Error("ImageKit filePath missing in file details response");
  }

  let extension = "";
  const dotIndex = currentName.lastIndexOf(".");
  if (dotIndex !== -1) {
    extension = currentName.substring(dotIndex);
  }

  const newBasename = sanitizeFileBasename(newTitle);
  const newFileName = `${newBasename}${extension}`;

  if (newFileName === currentName) {
    return fileDetails;
  }

  const renameUrl = "https://api.imagekit.io/v1/files/rename";
  const renameResponse = await axios.put(
    renameUrl,
    { filePath, newFileName, purgeCache: true },
    {
      headers: {
        Accept: "application/json",
        Authorization: getImageKitAuthHeader(),
        "Content-Type": "application/json",
      },
      validateStatus: (status) => status < 500,
    }
  );

  if (![200, 207].includes(renameResponse.status)) {
    throw new Error(
      `Failed to rename file in ImageKit (${renameResponse.status}): ${renameResponse.data}`
    );
  }

  return await getFileDetailsFromImageKit(fileId);
}

export async function deleteImageFromImageKit(fileId: string): Promise<boolean> {
  if (!fileId) throw new Error("file_id is required");

  const url = `https://api.imagekit.io/v1/files/${fileId}`;

  const response = await axios.delete(url, {
    headers: {
      Accept: "application/json",
      Authorization: getImageKitAuthHeader(),
    },
    validateStatus: (status) => status < 500,
  });

  if (response.status === 204) {
    console.log(`Successfully deleted file from ImageKit: ${fileId}`);
    return true;
  }
  if (response.status === 404) {
    console.log(`File not found in ImageKit: ${fileId}`);
    return true;
  }

  throw new Error(`ImageKit API returned ${response.status}: ${JSON.stringify(response.data)}`);
}
