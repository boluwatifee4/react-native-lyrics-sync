import React, { useState } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Colors } from '../../constants/theme';

const PILL_PADDING = 6;
const SPRING_CONFIG = { damping: 20, stiffness: 300, mass: 0.8 };

function GlassTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const [containerWidth, setContainerWidth] = useState(0);

  const tabWidth = containerWidth > 0 ? (containerWidth - PILL_PADDING * 2) / 2 : 0;

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  const slidingPillStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: withSpring(state.index * tabWidth, SPRING_CONFIG) }],
      width: withTiming(tabWidth, { duration: 200 }),
    };
  });

  return (
    <View
      style={[
        styles.tabBarContainer,
        {
          paddingBottom: Math.max(insets.bottom, 12) + 10,
        },
      ]}
    >
      <View style={styles.floatingPill} onLayout={handleLayout}>
        {/* Sliding active pill */}
        {tabWidth > 0 && (
          <Animated.View
            style={[styles.slidingPill, slidingPillStyle]}
            pointerEvents="none"
          />
        )}

        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key] || { options: {} };
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const isPlayer = route.name === 'index';
          const label = isPlayer ? 'Player' : 'Editor';
          const iconName = isPlayer
            ? (isFocused ? 'radio' : 'radio-outline')
            : (isFocused ? 'pulse' : 'pulse-outline');

          // Animate icon color with a simple opacity pulse
          const iconStyle = useAnimatedStyle(() => {
            return {
              opacity: withTiming(isFocused ? 1.0 : 0.6, { duration: 200 }),
            };
          });

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              style={[styles.tabButton]}
              activeOpacity={0.7}
            >
              <Animated.View style={iconStyle}>
                <Ionicons
                  name={iconName as any}
                  size={18}
                  color={isFocused ? '#000000' : '#7C828C'}
                />
              </Animated.View>
              <Text
                style={[styles.tabLabel, isFocused && styles.tabLabelActive]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'shift', // Smooth slide transition between screens
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Listener',
        }}
      />
      <Tabs.Screen
        name="editor"
        options={{
          title: 'Telemetry Sync',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  floatingPill: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(16, 18, 24, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(90, 100, 130, 0.35)',
    padding: PILL_PADDING,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
    position: 'relative',
  },
  slidingPill: {
    position: 'absolute',
    top: PILL_PADDING,
    bottom: PILL_PADDING,
    left: PILL_PADDING,
    borderRadius: 24,
    backgroundColor: Colors.dark.accent,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 1, // Above the sliding pill
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: '#9CA3AF',
  },
  tabLabelActive: {
    color: '#000000',
  },
});