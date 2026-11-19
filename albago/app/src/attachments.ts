import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { api, endpoint, type Attachment } from './api';

export const isImage = (a: Attachment) => a.type.startsWith('image/');

/** Authenticated image source for <Image>. */
export async function imageSource(a: Attachment) {
  const { url, headers } = await endpoint(api.attachmentPath(a.id));
  return { uri: url, headers };
}

/** Downloads a non-image attachment (e.g. PDF) to the cache and opens it in the share sheet / a viewer. */
export async function openFile(a: Attachment): Promise<void> {
  const { url, headers } = await endpoint(api.attachmentPath(a.id));
  const safe = a.name.replace(/[^\w.\-가-힣]/g, '_') || 'file';
  const file = await File.downloadFileAsync(url, new File(Paths.cache, `att-${a.id}-${safe}`), { headers, idempotent: true });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: a.type, dialogTitle: a.name });
  else await Linking.openURL(file.uri);
}

export const formatSize = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
