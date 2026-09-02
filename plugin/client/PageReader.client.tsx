import { useRpc } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { getPage, ZOOM } from "../contracts.js";
import type { Styles } from "./theme.client.js";

interface Props {
  workspaceId: string;
  relPath: string;
  pages: number;
  dpi: number;
  styles: Styles;
}

/** One page. Kept separate so each fetches only when it scrolls into view. */
function Page({ workspaceId, relPath, page, dpi, styles, maxWidth }: Props & { page: number; maxWidth: number }) {
  const fetchPage = useRpc(getPage);
  const { data, isLoading, error } = useQuery({
    queryKey: ["page", workspaceId, relPath, page, dpi],
    queryFn: () => fetchPage({ workspaceId, relPath, page, dpi }),
  });

  if (isLoading) {
    return (
      <View style={[styles.centre, { height: 320 }]}>
        <ActivityIndicator />
        <Text style={styles.muted}>Page {page}</Text>
      </View>
    );
  }
  if (error) return <Text style={styles.danger}>Page {page}: {(error as Error).message}</Text>;
  if (!data) return null;

  // Scale to fit the viewport width, but never blow a small page up beyond
  // its rendered size - that only makes it blurry.
  const ratio = data.height && data.width ? data.height / data.width : 1.414;
  const width = Math.min(data.width || maxWidth, maxWidth);

  return (
    <View style={{ marginBottom: 12 }}>
      <Image
        source={{ uri: data.dataUri }}
        style={{ width, height: width * ratio }}
        resizeMode="contain"
        accessibilityLabel={`Page ${page}`}
      />
    </View>
  );
}

export function PageReader({ workspaceId, relPath, pages, styles }: Omit<Props, "dpi">) {
  const [zoom, setZoom] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const dpi = ZOOM[zoom].dpi;

  // At anything above Fit the page is wider than the viewport on purpose, so
  // the reader scrolls sideways. This replaces pinch-zoom, which React Native
  // only supports on iOS and which needs a gesture library we cannot import.
  const contentWidth = Math.round(windowWidth * (dpi / ZOOM[0].dpi));

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Text style={styles.muted}>{pages} {pages === 1 ? "page" : "pages"}</Text>
        <View style={{ flex: 1 }} />
        {ZOOM.map((level, index) => (
          <Text
            key={level.label}
            onPress={() => setZoom(index)}
            accessibilityRole="button"
            accessibilityLabel={`Zoom ${level.label}`}
            style={[index === zoom ? styles.buttonOn : styles.button, index === zoom ? styles.buttonTextOn : styles.buttonText]}
          >
            {level.label}
          </Text>
        ))}
      </View>
      <ScrollView horizontal={contentWidth > windowWidth} contentContainerStyle={{ alignItems: "center" }}>
        <ScrollView contentContainerStyle={{ alignItems: "center", padding: styles.pad }}>
          {Array.from({ length: pages }, (_, i) => (
            <Page
              key={i}
              page={i + 1}
              workspaceId={workspaceId}
              relPath={relPath}
              pages={pages}
              dpi={dpi}
              styles={styles}
              maxWidth={contentWidth - styles.pad * 2}
            />
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
}
