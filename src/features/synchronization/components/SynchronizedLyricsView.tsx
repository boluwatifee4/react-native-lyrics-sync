import React, { useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Animated, { type SharedValue } from 'react-native-reanimated';
import { LyricLine, findActiveLineIndex } from '../../../domain/lyrics';
import { LyricWordItem } from './LyricWordItem';
import { usePlayerStore } from '../../player/store/usePlayerStore';

interface SynchronizedLyricsViewProps {
  lines: LyricLine[];
  timeMs: SharedValue<number>;
  onSeekRequested?: (startMs: number) => void;
}

export const SynchronizedLyricsView: React.FC<SynchronizedLyricsViewProps> = ({
  lines,
  timeMs,
  onSeekRequested,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const positionMs = usePlayerStore((s) => s.positionMs);

  const activeLineIndex = findActiveLineIndex(lines, positionMs);

  // Maintain stable focal position in center
  useEffect(() => {
    if (activeLineIndex >= 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: activeLineIndex,
        animated: true,
        viewPosition: 0.45, // Focal center position
      });
    }
  }, [activeLineIndex]);

  const handleLineTap = (startMs: number) => {
    if (onSeekRequested) {
      onSeekRequested(startMs);
    }
  };

  const renderLine = ({ item, index }: { item: LyricLine; index: number }) => {
    const isActive = index === activeLineIndex;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handleLineTap(item.startMs)}
        style={[styles.lineWrapper, isActive && styles.activeLineWrapper]}
      >
        <View style={styles.wordsContainer}>
          {item.words && item.words.length > 0 ? (
            item.words.map((word) => (
              <LyricWordItem
                key={word.id}
                word={word}
                timeMs={timeMs}
                isActiveLine={isActive}
              />
            ))
          ) : (
            <Text style={[styles.fallbackLineText, isActive && styles.activeFallbackText]}>
              {item.text}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={lines}
        keyExtractor={(item) => item.id}
        renderItem={renderLine}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  listContent: {
    paddingVertical: 180,
    paddingHorizontal: 24,
  },
  lineWrapper: {
    marginVertical: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  activeLineWrapper: {
    transform: [{ scale: 1.03 }],
  },
  wordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  fallbackLineText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#555555',
  },
  activeFallbackText: {
    color: '#00E5FF',
  },
});
