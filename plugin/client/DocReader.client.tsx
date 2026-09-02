import React from "react";
import { Image, ScrollView, Text, View } from "react-native";
import type { Block, Run } from "../contracts.js";
import type { Styles } from "./theme.client.js";

const HEADING_SIZE: Record<number, number> = { 1: 26, 2: 21, 3: 18, 4: 16, 5: 15, 6: 14 };

function Runs({ runs, styles, size }: { runs: Run[]; styles: Styles; size?: number }) {
  return (
    <>
      {runs.map((run, i) => (
        <Text
          key={i}
          style={[
            styles.body,
            size ? { fontSize: size, lineHeight: size * 1.35 } : null,
            run.bold ? { fontWeight: "600" } : null,
            run.italic ? { fontStyle: "italic" } : null,
            run.link ? styles.link : null,
          ]}
        >
          {run.text}
        </Text>
      ))}
    </>
  );
}

function BlockView({ block, styles }: { block: Block; styles: Styles }) {
  if (block.type === "heading") {
    const size = HEADING_SIZE[block.level] ?? 16;
    return (
      <Text style={[styles.heading, { fontSize: size, marginTop: 20, marginBottom: 8 }]}>
        <Runs runs={block.runs} styles={styles} size={size} />
      </Text>
    );
  }

  if (block.type === "paragraph") {
    return (
      <Text style={{ marginBottom: 12 }}>
        <Runs runs={block.runs} styles={styles} />
      </Text>
    );
  }

  if (block.type === "list") {
    return (
      <View style={{ marginBottom: 12, gap: 6 }}>
        {block.items.map((item, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 8 }}>
            <Text style={styles.muted}>{block.ordered ? `${i + 1}.` : "•"}</Text>
            <Text style={{ flex: 1 }}>
              <Runs runs={item} styles={styles} />
            </Text>
          </View>
        ))}
      </View>
    );
  }

  if (block.type === "table") {
    return (
      <ScrollView horizontal style={{ marginBottom: 16 }}>
        <View>
          {block.rows.map((row, r) => (
            <View key={r} style={{ flexDirection: "row" }}>
              {row.map((cell, c) => (
                <View key={c} style={styles.cell}>
                  <Text>
                    <Runs runs={cell} styles={styles} />
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  // Some .docx files are pasted screenshots with no text at all, so this
  // block type is the only thing standing between them and a blank page.
  return (
    <Image
      source={{ uri: block.dataUri }}
      style={{ width: "100%", height: undefined, aspectRatio: 1.4, marginBottom: 16 }}
      resizeMode="contain"
      accessibilityLabel={block.alt ?? "Embedded image"}
    />
  );
}

export function DocReader({ blocks, styles }: { blocks: Block[]; styles: Styles }) {
  if (blocks.length === 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.muted}>This document is empty</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: styles.pad }}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} styles={styles} />
      ))}
    </ScrollView>
  );
}
