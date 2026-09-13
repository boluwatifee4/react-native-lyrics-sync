import React, { memo, useEffect, useRef } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { LyricLine, findActiveLineIndex } from '../../../domain/lyrics';
import { LyricWordItem } from './LyricWordItem';
import { usePlayerStore } from '../../player/store/usePlayerStore';
import { COLOR_ACTIVE, COLOR_FUTURE, LINE_FOCUS_FLOOR, computeLineFocus } from './lyricMotion';

interface SynchronizedLyricsViewProps {
  lines: LyricLine[];
  timeMs: SharedValue<number>;
  onSeekRequested?: (startMs: number) => void;
}

interface LyricLineRowProps {
  line: LyricLine;
  timeMs: SharedValue<number>;
  onSeekRequested?: (startMs: number) => void;
}

/**
 * A single lyric line. The entire row derives its presence from the shared
 * audio clock: LINE_FOCUS_FLOOR when receded, 1 while the audio is inside the
 * line's window. Movement is a gentle camera reframe — never a teleport.
 */
const LyricLineRow = memo(function LyricLineRow({ line, timeMs, onSeekRequested }: LyricLineRowProps) {
  const rowStyle = useAnimatedStyle(() => {
    const focus = computeLineFocus(timeMs.value, line.startMs, line.endMs);
    return { opacity: focus };
  });

  const fallbackColorStyle = useAnimatedStyle(() => {
    const focus = computeLineFocus(timeMs.value, line.startMs, line.endMs);
    return {
      color: interpolateColor(
        focus,
        [LINE_FOCUS_FLOOR, 1],
        [COLOR_FUTURE, COLOR_ACTIVE],
        'RGB',
      ),
    };
  });

  const handleTap = () => {
    if (onSeekRequested && line.startMs > 0) {
      onSeekRequested(line.startMs);
    }
  };

  return (
    <Animated.View style={rowStyle}>
      <TouchableOpacity activeOpacity={0.7} onPress={handleTap} style={styles.lineWrapper}>
        <View style={styles.wordsContainer}>
          {line.words && line.words.length > 0 ? (
            line.words.map((word) => (
              <LyricWordItem key={word.id} word={word} timeMs={timeMs} />
            ))
          ) : (
            <Animated.Text style={[styles.fallbackLineText, fallbackColorStyle]}>
              {line.text}
            </Animated.Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

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
        viewPosition: 0.42, // Optical center focus
      });
    }
  }, [activeLineIndex]);

  const renderLine = ({ item }: { item: LyricLine }) => (
    <LyricLineRow line={item} timeMs={timeMs} onSeekRequested={onSeekRequested} />
  );

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
    backgroundColor: '#000000',
  },
  listContent: {
    paddingVertical: 160,
    paddingHorizontal: 24,
  },
  lineWrapper: {
    marginVertical: 10,
    paddingVertical: 4,
  },
  wordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  fallbackLineText: {
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: -0.2,
    lineHeight: 34,
  },
});