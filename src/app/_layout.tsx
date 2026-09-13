import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase, fetchTrackWithLyrics } from '../services/db';
import { usePlayerStore } from '../features/player/store/usePlayerStore';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const setActiveTrack = usePlayerStore((s) => s.setActiveTrack);

  useEffect(() => {
    async function prepare() {
      try {
        await initDatabase();
        const data = await fetchTrackWithLyrics('sample-1');
        if (data) {
          setActiveTrack(data.track, data.lines);
        }
      } catch (e) {
        console.error('Failed to initialize app database:', e);
      } finally {
        setIsReady(true);
      }
    }
    prepare();
  }, [setActiveTrack]);

  if (!isReady) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#3E9BFF" />
        <Text style={styles.loaderText}>Loading Synchronized Lyrics Engine...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000000' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    color: '#48484A',
    marginTop: 16,
    fontWeight: '400',
  },
});
