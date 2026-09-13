import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildLrcText } from '../../../domain/timelineEngine';
import { LyricLine } from '../../../domain/lyrics';

export async function exportLyricsAsLrc(lines: LyricLine[], baseName: string): Promise<void> {
  const lrcText = buildLrcText(lines);
  if (!lrcText || !lrcText.includes('\n')) {
    throw new Error('Nothing synced yet — mark at least one line first.');
  }

  const safeName =
    baseName.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_') || 'lyrics';
  const uri = `${FileSystem.cacheDirectory}${safeName}.lrc`;

  await FileSystem.writeAsStringAsync(uri, lrcText, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'audio/x-lrc',
    dialogTitle: 'Export .lrc',
    UTI: 'public.plain-text',
  });
}