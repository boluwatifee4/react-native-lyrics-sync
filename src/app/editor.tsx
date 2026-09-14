import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SyncEditorView } from '../features/creator/components/SyncEditorView';

export default function EditorScreen() {
  return (
    <View style={styles.container}>
      <SyncEditorView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
